const fs = require('fs');
const moment = require('moment');
const Bottleneck = require('bottleneck');
const decode = require('magnet-uri');
const horriblesubs = require('./horriblesubs_api.js');
const repository = require('../../lib/repository');
const { Type } = require('../../lib/types');
const { updateCurrentSeeders, updateTorrentSize } = require('../../lib/torrent');
const { createTorrentEntry, checkAndUpdateTorrent } = require('../../lib/torrentEntries');
const { getMetadata, getKitsuId } = require('../../lib/metadata');
const showMappings = require('./horriblesubs_mapping.json');

const NAME = 'HorribleSubs';
const NEXT_FULL_SCRAPE_OFFSET = 5 * 24 * 60 * 60; // 5 days;

const limiter = new Bottleneck({ maxConcurrent: 5 });
const entryLimiter = new Bottleneck({ maxConcurrent: 10 });

async function scrape() {
  const scrapeStart = moment();
  const lastScrape = await repository.getProvider({ name: NAME });
  const lastScraped = lastScrape.lastScraped && moment(lastScrape.lastScraped);

  if (!lastScraped || lastScraped.add(NEXT_FULL_SCRAPE_OFFSET, 'seconds') < scrapeStart) {
    console.log(`[${scrapeStart}] scrapping all ${NAME} shows...`);
    return _scrapeAllShows()
        .then(() => {
          lastScrape.lastScraped = scrapeStart;
          return lastScrape.save();
        })
        .then(() => console.log(`[${moment()}] finished scrapping all ${NAME} shows`));
  } else {
    console.log(`[${scrapeStart}] scrapping latest ${NAME} entries...`);
    return _scrapeLatestEntries()
        .then(() => console.log(`[${moment()}] finished scrapping latest ${NAME} entries`));
  }
}

async function updateSeeders(torrent) {
  return Promise.resolve([]);
}

async function _scrapeLatestEntries() {
  const latestEntries = await horriblesubs.getLatestEntries();

  return Promise.all(latestEntries
      .map((entryData) => limiter.schedule(() => _parseShowData(entryData)
          .catch((err) => console.log(err)))));
}

async function _scrapeAllShows() {
  const shows = await horriblesubs.allShows();

  return Promise.all(shows
      .map((show) => limiter.schedule(() => horriblesubs.showData(show)
          .then((showData) => _parseShowData(showData, false))
          .catch((err) => console.log(err)))));
}

async function compareSearchKitsuIds() {
  console.log(`${NAME}: initiating kitsu compare...`);
  const shows = await horriblesubs.allShows()
      .then((shows) => Promise.all(shows.slice(0, 1).map((show) => limiter.schedule(() => enrichShow(show)))));

  const incorrect = shows.filter(
      (show) => showMappings[show.title] && showMappings[show.title].kitsu_id !== show.kitsu_id);
  const incorrectRatio = incorrect.length / shows.length;
  console.log(incorrect);
  console.log(`Ratio: ${incorrectRatio}`);
}

async function initMapping() {
  console.log(`${NAME}: initiating kitsu mapping...`);
  const shows = await horriblesubs.allShows()
      .then((shows) => shows.filter((show) => !showMappings[show.title]))
      .then((shows) => Promise.all(shows.map((show) => limiter.schedule(() => enrichShow(show)))))
      .then((shows) => shows.reduce((map, show) => (map[show.title] = show, map), showMappings));

  fs.writeFile(
      "./scraper/scrapers/horriblesubs/horriblesubs_mapping.json",
      JSON.stringify(shows), 'utf8',
      (err) => {
        if (err) {
          console.log("An error occurred while writing JSON Object to File.", err);
        } else {
          console.log(`${NAME}: finished kitsu mapping`);
        }
      }
  );
}

async function enrichShow(show) {
  console.log(`${NAME}: getting show info for ${show.title}...`);
  const showId = await horriblesubs._getShowId(show.url)
      .catch(() => show.title);
  const metadata = await getKitsuId({ title: show.title })
      .then((kitsuId) => getMetadata(kitsuId))
      .catch((error) => {
        console.log(`Failed getting kitsu meta: ${error.message}`);
        return {};
      });

  return {
    showId: showId,
    kitsu_id: metadata.kitsuId,
    ...show,
    kitsuTitle: metadata.title,
    imdb_id: metadata.imdbId
  }
}

async function _parseShowData(showData, updateSeeders = true) {
  console.log(`${NAME}: scrapping ${showData.title} data...`);
  const showMapping = showMappings[showData.title];
  const kitsuId = showMapping && showMapping.kitsu_id;
  if (!showMapping) {
    throw new Error(`No kitsu mapping found for ${showData.title}`);
  }
  if (!kitsuId) {
    throw new Error(`No kitsuId found for ${showData.title}`);
  }

  // sometimes horriblesubs entry contains multiple season in it, so need to split it per kitsu season entry
  const kitsuIdsMapping = Array.isArray(kitsuId) && await Promise.all(kitsuId.map(kitsuId => getMetadata(kitsuId)))
      .then((metas) => metas.reduce((map, meta) => {
        const epOffset = Object.keys(map).length;
        [...Array(meta.totalCount || 1).keys()]
            .map(ep => ep + 1)
            .forEach(ep => map[ep + epOffset] = { kitsuId: meta.kitsuId, episode: ep, title: meta.title });
        return map;
      }, {})) || {};
  const formatTitle = (episodeInfo, mirror) => {
    const mapping = kitsuIdsMapping[episodeInfo.episode.replace(/^0+/, '')];
    if (mapping) {
      return `${mapping.title} - ${mapping.episode} [${mirror.resolution}]`;
    }
    return `${episodeInfo.title} - ${episodeInfo.episode} [${mirror.resolution}]`;
  };
  const getKitsuId = inputEpisode => {
    const episodeString = inputEpisode.includes('-') && inputEpisode.split('-')[0] || inputEpisode;
    const episode = parseInt(episodeString, 10);
    if (kitsuIdsMapping[episode]) {
      return kitsuIdsMapping[episode].kitsuId;
    } else if (Array.isArray(kitsuId)) {
      console.warn(`Unmapped episode number for ${showData.title} - ${inputEpisode}`);
      return undefined;
    }
    return kitsuId;
  };

  return Promise.all([].concat(showData.singleEpisodes || []).concat(showData.packEpisodes || [])
      .map(episodeInfo => episodeInfo.mirrors
          .filter(mirror => mirror.magnetLink && mirror.magnetLink.length)
          .map(mirror => ({
            provider: NAME,
            ...mirror,
            infoHash: decode(mirror.magnetLink).infoHash,
            trackers: decode(mirror.magnetLink).tr.join(','),
            title: formatTitle(episodeInfo, mirror),
            type: Type.ANIME,
            kitsuId: getKitsuId(episodeInfo.episode),
            uploadDate: episodeInfo.uploadDate,
          })))
      .reduce((a, b) => a.concat(b), [])
      .filter(torrent => torrent.kitsuId)
      .map(torrent => entryLimiter.schedule(() => processTorrentRecord(torrent, updateSeeders))))
      .then(() => console.log(`${NAME}: finished scrapping ${showData.title} data`));
}

async function processTorrentRecord(torrent, updateSeeders = true) {
  const existingTorrent = await repository.getTorrent(torrent).catch(() => undefined);

  if (existingTorrent && existingTorrent.provider === NAME) {
    if (updateSeeders) {
      return updateCurrentSeeders(torrent).then(updatedSeeders => checkAndUpdateTorrent(updatedSeeders))
    }
    return Promise.resolve(torrent)
  }

  return updateTorrentSize(torrent)
      .then(updated => updateCurrentSeeders(updated))
      .then(updated => createTorrentEntry(updated, true))
      .catch(error => console.warn(`Failed creating entry for ${torrent.title}:`, error));
}

module.exports = { scrape, updateSeeders, NAME };