const axios = require('axios');
const moment = require('moment');
const Bottleneck = require('bottleneck');
const { ungzip } = require('node-gzip');
const LineByLineReader = require('line-by-line');
const fs = require('fs');
const thepiratebay = require('./thepiratebay_api.js');
const bing = require('nodejs-bing');
const { Type } = require('../../lib/types');
const { escapeHTML } = require('../../lib/metadata');
const { createTorrentEntry, createSkipTorrentEntry, getStoredTorrentEntry } = require('../../lib/torrentEntries');

const NAME = 'ThePirateBay';
const CSV_FILE_PATH = '/tmp/tpb_dump.csv';

const limiter = new Bottleneck({ maxConcurrent: 40 });

async function scrape() {
  const lastDump = { updatedAt: 2147000000 };
  //const checkPoint = moment('2016-06-17 00:00:00', 'YYYY-MMM-DD HH:mm:ss').toDate();
  //const lastDump = await thepiratebay.dumps().then((dumps) => dumps.sort((a, b) => b.updatedAt - a.updatedAt)[0]);
  const checkPoint = 0;

  if (lastDump) {
    console.log(`starting to scrape tpb dump: ${JSON.stringify(lastDump)}`);
    await downloadDump(lastDump);

    let entriesProcessed = 0;
    const lr = new LineByLineReader(CSV_FILE_PATH);
    lr.on('line', (line) => {
      if (line.includes("#ADDED")) {
        return;
      }
      if (entriesProcessed % 1000 === 0) {
        console.log(`Processed ${entriesProcessed} entries`);
      }
      if (entriesProcessed <= checkPoint) {
        entriesProcessed++;
        return;
      }

      const row = line.match(/(?<=^|;)(".*"|[^;]+)(?=;|$)/g);
      if (row.length !== 4) {
        console.log(`Invalid row: ${line}`);
        return;
      }
      const torrent = {
        uploadDate: moment(row[0], 'YYYY-MMM-DD HH:mm:ss').toDate(),
        infoHash: Buffer.from(row[1], 'base64').toString('hex'),
        title: escapeHTML(row[2])
            .replace(/^"|"$/g, '')
            .replace(/&#?\w{2,6};/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
        size: parseInt(row[3], 10)
      };

      if (!limiter.empty()) {
        lr.pause()
      }

      limiter.schedule(() => processTorrentRecord(torrent)
              .catch((error) => console.log(`failed ${torrent.title} due: ${error}`)))
          .then(() => limiter.empty())
          .then((empty) => empty && lr.resume())
          .then(() => entriesProcessed++);
    });
    lr.on('error', (err) => {
      console.log(err);
    });
    lr.on('end', () => {
      console.log(`finished to scrape tpb dump: ${JSON.stringify(lastDump)}!`);
    });
  }
}

const allowedCategories = [
  thepiratebay.Categories.VIDEO.MOVIES,
  thepiratebay.Categories.VIDEO.MOVIES_HD,
  thepiratebay.Categories.VIDEO.MOVIES_DVDR,
  thepiratebay.Categories.VIDEO.MOVIES_3D,
  thepiratebay.Categories.VIDEO.TV_SHOWS,
  thepiratebay.Categories.VIDEO.TV_SHOWS_HD
];
const seriesCategories = [
  thepiratebay.Categories.VIDEO.TV_SHOWS,
  thepiratebay.Categories.VIDEO.TV_SHOWS_HD
];

async function processTorrentRecord(record) {
  if (await getStoredTorrentEntry(record)) {
    return;
  }

  const torrentFound = await findTorrent(record);

  if (!torrentFound || !allowedCategories.includes(torrentFound.subcategory)) {
    return createSkipTorrentEntry(record);
  }

  const torrent = {
    infoHash: torrentFound.infoHash,
    provider: NAME,
    torrentId: torrentFound.torrentId,
    title: torrentFound.name,
    size: torrentFound.size,
    type: seriesCategories.includes(torrentFound.subcategory) ? Type.SERIES : Type.MOVIE,
    imdbId: seriesCategories.includes(torrentFound.subcategory) && torrentFound.imdbId || undefined,
    uploadDate: torrentFound.uploadDate || record.uploadDate,
    seeders: torrentFound.seeders,
  };

  return createTorrentEntry(torrent);
}

async function findTorrent(record) {
  return findTorrentInSource(record)
      .catch(() => findTorrentViaBing(record));
}

async function findTorrentInSource(record) {
  let page = 0;
  let torrentFound;
  while (!torrentFound && page < 5) {
    const torrents = await thepiratebay.search(record.title.replace(/[\W\s]+/, ' '), { page: page });
    torrentFound = torrents.filter(torrent => torrent.magnetLink.toLowerCase().includes(record.infoHash))[0];
    page = torrents.length === 0 ? 1000 : page + 1;
  }
  if (!torrentFound) {
    return Promise.reject(new Error(`Failed to find torrent ${record.title}`));
  }
  return Promise.resolve(torrentFound)
      .then((torrent) => thepiratebay.torrent(torrent.torrentId)
          .catch(() => thepiratebay.torrent(torrent.torrentId)));
}

async function findTorrentViaBing(record) {
  return bing.web(`${record.infoHash}`)
      .then((results) => results
          .find(result => result.description.includes('Direct download via magnet link') ||
              result.description.includes('Get this torrent')))
      .then((result) => {
        if (!result) {
          console.warn(`Failed to find torrent ${record.title}`);
          return Promise.resolve(undefined);
        }
        return result.link.match(/torrent\/(\w+)\//)[1];
      })
      .then((torrentId) => torrentId && thepiratebay.torrent(torrentId))
}

function downloadDump(dump) {
  try {
    if (fs.existsSync(CSV_FILE_PATH)) {
      console.log('dump file already exist...');
      return;
    }
  } catch (err) {
    console.error(err)
  }

  console.log('downloading dump file...');
  return axios.get(dump.url, { timeout: 2000, responseType: 'stream' })
      .then((response) => response.data)
      .then((body) => {
        console.log('unzipping dump file...');
        return ungzip(body);
      })
      .then((unzipped) => {
        console.log('writing dump file...');
        return fs.promises.writeFile(CSV_FILE_PATH, unzipped);
      })
}

module.exports = { scrape, NAME };