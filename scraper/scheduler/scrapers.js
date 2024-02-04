// const thepiratebayScraper = require('../scrapers/thepiratebay/thepiratebay_scraper');
// const thepiratebayFakeRemoval = require('../scrapers/thepiratebay/thepiratebay_fakes_removal');
const ytsScraper = require('../scrapers/yts/yts_scraper');
const ytsFullScraper = require('../scrapers/yts/yts_full_scraper');
const eztvScraper = require('../scrapers/eztv/eztv_scraper');
const leetxScraper = require('../scrapers/1337x/1337x_scraper');
// const rarbgScraper = require('../scrapers/rarbg/rarbg_scraper');
const nyaaPantsuScraper = require('../scrapers/nyaapantsu/nyaa_pantsu_scraper');
const nyaaSiScraper = require('../scrapers/nyaasi/nyaa_si_scraper');
// const erairawsScraper = require('../scrapers/erairaws/erairaws_scraper');
// const torrentGalaxyScraper = require('../scrapers/torrentgalaxy/torrentgalaxy_scraper');
// const rutorScraper = require('../scrapers/rutor/rutor_scraper');
// const Comando = require('../scrapers/comando/comando_scraper')
// const ComoEuBaixo = require('../scrapers/comoeubaixo/comoeubaixo_scraper')
// const Lapumia = require('../scrapers/lapumia/lapumia_scraper')
// const OndeBaixa = require('../scrapers/ondebaixa/ondebaixa_scraper');
// const AnimesTorrent = require('../scrapers/animestorrent/animestorrent_scraper')
// const DarkMahou = require('../scrapers/darkmahou/darkmahou_scraper')
// const torrent9Scraper = require('../scrapers/torrent9/torrent9_scraper');

module.exports = [
  { scraper: ytsScraper, name: ytsScraper.NAME, cron: '0 0 */4 ? * *' },
  { scraper: ytsFullScraper, name: ytsFullScraper.NAME, cron: '0 0 0 * * 0' },
  { scraper: eztvScraper, name: eztvScraper.NAME, cron: '0 0 */4 ? * *' },
  { scraper: nyaaSiScraper, name: nyaaSiScraper.NAME, cron: '0 0 */4 ? * *' },
  { scraper: nyaaPantsuScraper, name: nyaaPantsuScraper.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: rarbgScraper, name: rarbgScraper.NAME, cron: '0 0 */1 ? * *' },
  // { scraper: rutorScraper, name: rutorScraper.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: thepiratebayScraper, name: thepiratebayScraper.NAME, cron: '0 0 */2 ? * *' },
  // { scraper: thepiratebayFakeRemoval, name: thepiratebayFakeRemoval.NAME, cron: '0 0 */12 ? * *' },
  // { scraper: torrentGalaxyScraper, name: torrentGalaxyScraper.NAME, cron: '0 0 */4 ? * *' },
  { scraper: leetxScraper, name: leetxScraper.NAME, cron: '0 0 */4 ? * *' }
  // { scraper: torrent9Scraper, name: torrent9Scraper.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: Comando, name: Comando.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: ComoEuBaixo, name: ComoEuBaixo.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: Lapumia, name: Lapumia.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: OndeBaixa, name: OndeBaixa.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: AnimesTorrent, name: AnimesTorrent.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: DarkMahou, name: DarkMahou.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: erairawsScraper, name: erairawsScraper.NAME, cron: '0 0 */4 ? * *' },
  // { scraper: require('../scrapers/rarbg/rarbg_dump_scraper') }
  // { scraper: require('../scrapers/1337x/1337x_search_scraper') }
  // { scraper: require('../scrapers/rarbg/rarbg_dump_scraper') }
  // { scraper: require('../scrapers/thepiratebay/thepiratebay_dump_scraper') }
  // { scraper: require('../scrapers/thepiratebay/thepiratebay_unofficial_dump_scraper') }
  // { scraper: require('../scrapers/thepiratebay/thepiratebay_update_size_scraper') }
];
