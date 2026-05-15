import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

export async function queryAll(databaseId, filter, sorts) {
  const results = [];
  let cursor;
  do {
    const r = await notion.databases.query({
      database_id: databaseId,
      filter,
      sorts,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return results;
}

export function getProp(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  switch (p.type) {
    case "title":
    case "rich_text":
      return p[p.type].map((t) => t.plain_text).join("");
    case "select":
      return p.select?.name ?? null;
    case "multi_select":
      return p.multi_select.map((x) => x.name);
    case "checkbox":
      return p.checkbox;
    case "number":
      return p.number;
    case "url":
      return p.url;
    case "date":
      return p.date?.start ?? null;
    case "created_time":
      return p.created_time;
    default:
      return null;
  }
}

export function getPlainText(rich) {
  return rich.map((t) => t.plain_text).join("");
}

export async function urlExists(databaseId, url) {
  const r = await notion.databases.query({
    database_id: databaseId,
    filter: { property: "URL", url: { equals: url } },
    page_size: 1,
  });
  return r.results.length > 0;
}

export async function emailUrlExists(databaseId, url) {
  const r = await notion.databases.query({
    database_id: databaseId,
    filter: { property: "元メールURL", url: { equals: url } },
    page_size: 1,
  });
  return r.results.length > 0;
}

export async function linkExists(databaseId, url) {
  const r = await notion.databases.query({
    database_id: databaseId,
    filter: { property: "リンク", url: { equals: url } },
    page_size: 1,
  });
  return r.results.length > 0;
}
