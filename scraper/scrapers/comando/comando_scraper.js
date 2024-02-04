const moment = require("moment");
const Bottleneck = require("bottleneck");
const comando = require("./comando_api");
const { Type } = require("../../lib/types");
const repository = require("../../lib/repository");
const Promises = require("../../lib/promises");
const { updateCurrentSeeders, updateTorrentSize } = require("../../lib/torrent");
const { createTorrentEntry, checkAndUpdateTorrent } = require("../../lib/torrentEntries");
const { getImdbId } = require("../../lib/metadata");

const NAME = "Comando";
const UNTIL_PAGE = 5;
const TYPE_MAPPING = typeMapping();

const limiter = new Bottleneck({ maxConcurrent: 5 });

async function scrape() {
  const scrapeStart = moment();
  const lastScrape = await repository.getProvider({ name: NAME });
  console.log(`[${scrapeStart}] starting ${NAME} scrape...`);

  return scrapeLatestTorrents()
      .then(() => {
        lastScrape.lastScraped = scrapeStart;
        return lastScrape.save();
      })
      .then(() => console.log(`[${moment()}] finished ${NAME} scrape`));
}

async function updateSeeders(torrent) {
  return limiter.schedule(() => comando.torrent(torrent.torrentId));
}

async function scrapeLatestTorrents() {
  const allowedCategories = [
    comando.Categories.MOVIE,
    comando.Categories.TV
  ];

  return Promises.sequence(allowedCategories
          .map((category) => () => scrapeLatestTorrentsForCategory(category)))
      .then((entries) => entries.reduce((a, b) => a.concat(b), []));
}

async function scrapeLatestTorrentsForCategory(category, page = 1) {
  console.log(`Scrapping ${NAME} ${category} category page ${page}`);
  return comando.browse({ category, page })
      .catch((error) => {
        console.warn(`Failed ${NAME} scrapping for [${page}] ${category} due: `, error);
        return Promise.resolve([]);
      })
      .then((torrents) => Promise.all(torrents.map((torrent) => limiter.schedule(() => processEntry(torrent)))))
      .then((resolved) => resolved.length > 0 && page < untilPage(category)
          ? scrapeLatestTorrentsForCategory(category, page + 1)
          : Promise.resolve());
}

async function processEntry(entry) {
  return comando.torrent(entry.torrentId)
      .then(records => Promises.sequence(records.map(record => () => processTorrentRecord(record))))
      .catch(() => undefined);
}

async function processTorrentRecord(foundTorrent) {
  if (await checkAndUpdateTorrent({ provider: NAME, ...foundTorrent })) {
    return foundTorrent;
  }

  if (!foundTorrent.size) {
    await updateTorrentSize(foundTorrent);
  }
  if (!Number.isInteger(foundTorrent.seeders)) {
    await updateCurrentSeeders(foundTorrent);
  }
  if (!foundTorrent.imdbId && foundTorrent.originalName) {
    const info = { title: foundTorrent.originalName, year: foundTorrent.year };
    foundTorrent.imdbId = await getImdbId(info, TYPE_MAPPING[foundTorrent.category]).catch(() => undefined);
  }

  const torrent = {
    infoHash: foundTorrent.infoHash,
    provider: NAME,
    torrentId: foundTorrent.torrentId,
    title: foundTorrent.title,
    type: TYPE_MAPPING[foundTorrent.category],
    imdbId: foundTorrent.imdbId,
    uploadDate: foundTorrent.uploadDate,
    seeders: foundTorrent.seeders,
    size: foundTorrent.size,
    files: foundTorrent.files,
    languages: foundTorrent.languages
  };
  return createTorrentEntry(torrent);
}

function typeMapping() {
  const mapping = {};
  mapping[comando.Categories.MOVIE] = Type.MOVIE;
  mapping[comando.Categories.DOCUMENTARIES] = Type.SERIES;
  mapping[comando.Categories.TV] = Type.SERIES;
  mapping[comando.Categories.ANIME] = Type.ANIME;
  return mapping;
}

function untilPage(category) {
  if (comando.Categories.TV === category) {
    return 5;
  }
  return UNTIL_PAGE;
}

module.exports = { scrape, updateSeeders, NAME };
