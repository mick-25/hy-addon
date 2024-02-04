const axios = require('axios');
const cheerio = require("cheerio");
const decode = require('magnet-uri');
const { escapeHTML } = require('../../lib/metadata');
const { getRandomUserAgent } = require('../../lib/requestHelper');
const { isPtDubbed, sanitizePtName, sanitizePtLanguages } = require('../scraperHelper')

const defaultTimeout = 30000;
const maxSearchPage = 50

const baseUrl = 'https://comoeubaixo.com';

const Categories = {
  MOVIE: 'filmes',
  TV: 'series',
  ANIME: 'anime',
  DESENHOS: 'desenhos'
};

function torrent(torrentId, config = {}, retries = 2) {
  if (!torrentId || retries === 0) {
    return Promise.reject(new Error(`Failed ${torrentId} query`));
  }
  const slug = encodeURIComponent(torrentId.split("/")[3]);
  return singleRequest(`${baseUrl}/${slug}/`, config)
      .then((body) => parseTorrentPage(body))
      .then((torrent) => torrent.map(el => ({ torrentId: slug, ...el })))
      .catch((err) => {
        console.warn(`Failed ComoEuBaixo ${torrentId} request: `, err);
        return torrent(torrentId, config, retries - 1)
      });
}

function search(keyword, config = {}, retries = 2) {
  if (!keyword || retries === 0) {
    return Promise.reject(new Error(`Failed ${keyword} search`));
  }
  const page = config.page || 1;
  const extendToPage = Math.min(maxSearchPage, (config.extendToPage || 1))

  return singleRequest(`${baseUrl}/${keyword}/${page}/`, config)
      .then(body => parseTableBody(body))
      .then(torrents => torrents.length === 40 && page < extendToPage
          ? search(keyword, { ...config, page: page + 1 }).catch(() => [])
              .then(nextTorrents => torrents.concat(nextTorrents))
          : torrents)
      .catch((err) => search(keyword, config, retries - 1));
}

function browse(config = {}, retries = 2) {
  if (retries === 0) {
    return Promise.reject(new Error(`Failed browse request`));
  }
  const page = config.page || 1;
  const category = config.category;
  const requestUrl = category ? `${baseUrl}/${category}/${page}/` : `${baseUrl}/${page}/`;

  return singleRequest(requestUrl, config)
      .then((body) => parseTableBody(body))
      .catch((err) => browse(config, retries - 1));
}

function singleRequest(requestUrl, config = {}) {
  const timeout = config.timeout || defaultTimeout;
  const options = { headers: { 'User-Agent': getRandomUserAgent() }, timeout: timeout };

  return axios.get(requestUrl, options)
      .then((response) => {
        const body = response.data;
        if (!body || (Buffer.isBuffer(body) && !body.size)) {
          throw new Error(`No body: ${requestUrl}`);
        } else if (body.includes('502: Bad gateway') ||
            body.includes('403 Forbidden')) {
          throw new Error(`Invalid body contents: ${requestUrl}`);
        }
        return body;
      })
      .catch(error => Promise.reject(error.message || error));
}

function parseTableBody(body) {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(body);

    if (!$) {
      reject(new Error('Failed loading body'));
    }

    const torrents = [];

    $('div.capa_larga.align-middle').each((i, element) => {
      const row = $(element);
      torrents.push({
        name: row.find("a").text(),
        torrentId: row.find("a").attr("href"),
        isTorrent: !!row.find("p:contains(\'Torrent\')")[0]
      });
    });
    resolve(torrents);
  });
}

function parseTorrentPage(body) {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(body);

    if (!$) {
      reject(new Error('Failed loading body'));
    }
    const magnets = $(`a[href^="magnet"]`)
        .filter((i, elem) => isPtDubbed($(elem).attr('title')))
        .map((i, elem) => $(elem).attr("href")).get();
    const details = $('div#informacoes')
    const category = details.find('strong:contains(\'Gêneros: \')').next().attr('href').split('/')[0]
    const torrents = magnets.map(magnetLink => {
      const decodedMagnet = decode(magnetLink);
      const name = sanitizePtName(escapeHTML(decodedMagnet.name || '').replace(/\+/g, ' '));
      const originalTitle = details.find('strong:contains(\'Baixar\')')[0].nextSibling.nodeValue.split('-')[0];
      const year = details.find('strong:contains(\'Data de Lançamento: \')').next().text().trim();
      const fallBackTitle = `${originalTitle.trim()} ${year.trim()} ${name.trim()}`;
      return {
        title: name.length > 5 ? name : fallBackTitle,
        infoHash: decodedMagnet.infoHash,
        magnetLink: magnetLink,
        category: category,
        uploadDate: new Date($('time').attr('datetime')),
        imdbId: details.find('a[href*="imdb.com"]').attr('href').split('/')[4],
        languages: sanitizePtLanguages(details.find('strong:contains(\'Idioma\')')[0].nextSibling.nodeValue)
      };
    })
    resolve(torrents.filter((x) => x));
  });
}

module.exports = { torrent, search, browse, Categories };