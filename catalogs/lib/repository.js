import { Sequelize, QueryTypes } from 'sequelize';
import { Type } from '../../addon/lib/types.js';

const DATABASE_URI = process.env.DATABASE_URI;

const database = new Sequelize(DATABASE_URI, { logging: false });

export async function getIds(providers, type, startDate, endDate) {
  const idName = type === Type.ANIME ? 'kitsuId' : 'imdbId';
  const episodeCondition = type === Type.SERIES
      ? 'AND files."imdbSeason" IS NOT NULL AND files."imdbEpisode" IS NOT NULL'
      : '';
  const dateCondition = startDate && endDate
      ? `AND "uploadDate" BETWEEN '${startDate}' AND '${endDate}'`
      : '';
  const providersCondition = providers && providers.length
      ? `AND provider in (${providers.map(it => `'${it}'`).join(',')})`
      : '';
  const titleCondition = type === Type.MOVIE
      ? 'AND torrents.title NOT LIKE \'%[Erotic]%\''
      : '';
  const sortCondition = type === Type.MOVIE ? 'sum(torrents.seeders)' : 'max(torrents.seeders)';
  const query = `SELECT files."${idName}"
        FROM (SELECT torrents."infoHash", torrents.seeders FROM torrents
                WHERE seeders > 0 AND type = '${type}' ${providersCondition} ${dateCondition} ${titleCondition}
              ) as torrents
        JOIN files ON torrents."infoHash" = files."infoHash"
        WHERE files."${idName}" IS NOT NULL ${episodeCondition}
        GROUP BY files."${idName}"
        ORDER BY ${sortCondition} DESC
        LIMIT 5000`
  const results = await database.query(query, { type: QueryTypes.SELECT });
  return results.map(result => `${result.imdbId || result.kitsuId}`);
}
