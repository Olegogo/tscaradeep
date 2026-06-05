import { readFile } from "node:fs/promises";

const env = await readEnv(".env");
const products = JSON.parse(await readFile("data/products.json", "utf8"));
const notionVersion = "2022-06-28";

if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
  throw new Error("NOTION_TOKEN and NOTION_DATABASE_ID are required in .env");
}

const database = await notionFetch(`/databases/${env.NOTION_DATABASE_ID}`);
const properties = database.properties || {};
const existingPages = await queryDatabase(env.NOTION_DATABASE_ID);
const pagesBySlug = new Map();
const pagesByOrder = new Map();

for (const page of existingPages) {
  const fields = page.properties || {};
  const slug = plainText(fields.Slug?.rich_text);
  const order = fields.Order?.number;

  if (slug) {
    pagesBySlug.set(slug, page);
  }

  if (Number.isFinite(order)) {
    pagesByOrder.set(order, page);
  }
}

let updated = 0;
let created = 0;

for (const product of products) {
  const page = pagesBySlug.get(product.id) || pagesByOrder.get(product.order);
  const payload = {
    properties: productProperties(product, properties)
  };

  if (page) {
    await notionFetch(`/pages/${page.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    updated += 1;
  } else {
    await notionFetch("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: env.NOTION_DATABASE_ID },
        ...payload
      })
    });
    created += 1;
  }
}

console.log(JSON.stringify({ ok: true, sourceProducts: products.length, updated, created }, null, 2));

async function queryDatabase(databaseId) {
  const pages = [];
  let startCursor;

  do {
    const data = await notionFetch(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: startCursor,
        sorts: [{ property: "Order", direction: "ascending" }]
      })
    });

    pages.push(...(data.results || []));
    startCursor = data.has_more ? data.next_cursor : undefined;
  } while (startCursor);

  return pages;
}

function productProperties(product, schema) {
  const props = {};

  setTitle(props, schema, "Name", product.name);
  setText(props, schema, "Slug", product.id);
  setText(props, schema, "SKU", product.sku);
  setText(props, schema, "Description", product.description);
  setNumber(props, schema, "Price", product.price);
  setCheckbox(props, schema, "Published", product.published !== false);
  setNumber(props, schema, "Order", product.order);
  setNumber(props, schema, "Layout X", product.layout?.x);
  setNumber(props, schema, "Layout Y", product.layout?.y);
  setNumber(props, schema, "Layout W", product.layout?.w);
  setNumber(props, schema, "Layout H", product.layout?.h);

  if (schema.Image?.type === "files" && product.image) {
    props.Image = {
      files: [
        {
          name: product.name,
          external: { url: product.image }
        }
      ]
    };
  }

  return props;
}

function setTitle(props, schema, name, value) {
  if (schema[name]?.type !== "title") {
    return;
  }

  props[name] = {
    title: [{ text: { content: String(value || "") } }]
  };
}

function setText(props, schema, name, value) {
  if (schema[name]?.type !== "rich_text") {
    return;
  }

  props[name] = {
    rich_text: [{ text: { content: String(value || "") } }]
  };
}

function setNumber(props, schema, name, value) {
  if (schema[name]?.type !== "number") {
    return;
  }

  props[name] = {
    number: Number.isFinite(Number(value)) ? Number(value) : null
  };
}

function setCheckbox(props, schema, name, value) {
  if (schema[name]?.type !== "checkbox") {
    return;
  }

  props[name] = {
    checkbox: Boolean(value)
  };
}

function plainText(items = []) {
  return items.map((item) => item.plain_text || "").join("").trim();
}

async function notionFetch(path, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${env.NOTION_TOKEN}`,
      "content-type": "application/json",
      "notion-version": notionVersion
    },
    body: options.body
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Notion API ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function readEnv(path) {
  const text = await readFile(path, "utf8");
  const result = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    result[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
  }

  return result;
}
