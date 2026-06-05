import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTION_DATA_SOURCE_VERSION = "2026-03-11";
const NOTION_DATABASE_VERSION = "2022-06-28";

let cachedProducts = null;
let cachedAt = 0;

export async function getProducts() {
  const ttlMs = Number(process.env.PRODUCT_CACHE_TTL_SECONDS || 60) * 1000;

  if (cachedProducts && Date.now() - cachedAt < ttlMs) {
    return cachedProducts;
  }

  const provider = String(process.env.CMS_PROVIDER || "local").toLowerCase();

  try {
    const products =
      provider === "airtable"
        ? await getAirtableProducts()
        : provider === "notion"
          ? await getNotionProducts()
          : await getLocalProducts();

    cachedProducts = sortProducts(products);
    cachedAt = Date.now();
    return cachedProducts;
  } catch (error) {
    console.error(`CMS provider "${provider}" failed. Falling back to local products.`);
    console.error(error);

    cachedProducts = sortProducts(await getLocalProducts());
    cachedAt = Date.now();
    return cachedProducts;
  }
}

async function getLocalProducts() {
  const contents = await readFile(path.join(__dirname, "data", "products.json"), "utf8");
  return JSON.parse(contents).map((product, index) => normalizeProduct(product, index, product.id));
}

async function getAirtableProducts() {
  const token = requireEnv("AIRTABLE_API_KEY");
  const baseId = requireEnv("AIRTABLE_BASE_ID");
  const table = process.env.AIRTABLE_TABLE_NAME || "Products";
  const view = process.env.AIRTABLE_VIEW;
  const records = [];
  let offset = "";

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");

    if (view) {
      url.searchParams.set("view", view);
    }

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset);

  return records
    .map((record, index) => normalizeProduct(record.fields || {}, index, record.id))
    .filter((product) => product.published);
}

async function getNotionProducts() {
  const token = requireEnv("NOTION_TOKEN");
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (dataSourceId) {
    return getNotionProductsFromEndpoint(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      token,
      NOTION_DATA_SOURCE_VERSION
    );
  }

  if (databaseId) {
    return getNotionProductsFromEndpoint(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      token,
      NOTION_DATABASE_VERSION
    );
  }

  throw new Error("NOTION_DATA_SOURCE_ID or NOTION_DATABASE_ID is required");
}

async function getNotionProductsFromEndpoint(endpoint, token, notionVersion) {
  const records = [];
  let startCursor = undefined;

  do {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "notion-version": notionVersion
      },
      body: JSON.stringify({
        page_size: 100,
        start_cursor: startCursor
      })
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    records.push(...(data.results || []));
    startCursor = data.has_more ? data.next_cursor : undefined;
  } while (startCursor);

  return records
    .map((page, index) => normalizeProduct(notionFields(page.properties || {}), index, page.id))
    .filter((product) => product.published);
}

function normalizeProduct(fields, index, fallbackId) {
  const layout = fields.layout || getLayout(fields, index);
  const name = textField(fields, ["Name", "Title", "Название", "name", "title"]) || `Product ${index + 1}`;
  const sku = textField(fields, ["SKU", "Артикул", "sku"]) || `TSL-${String(index + 1).padStart(3, "0")}`;

  const images = imageListField(fields, ["Image", "Images", "Photo", "Фото", "image"]);

  return {
    id: slug(textField(fields, ["Slug", "ID", "Id", "id", "slug"]) || fallbackId || name),
    sku,
    name,
    category: textField(fields, ["Category", "Категория", "category"]) || "Object",
    price: numberField(fields, ["Price", "Цена", "price"], 0),
    description: textField(fields, ["Description", "Описание", "description"]) || "",
    status: textField(fields, ["Status", "Статус", "status"]) || "В наличии",
    image: images[0] || "",
    images,
    order: numberField(fields, ["Order", "Sort", "Порядок", "order", "sort"], index + 1),
    published: booleanField(fields, ["Published", "Опубликовано", "published"], true),
    layout
  };
}

function getLayout(fields, index) {
  const fallback = defaultLayouts[index % defaultLayouts.length];

  return {
    x: numberField(fields, ["Layout X", "X"], fallback.x),
    y: numberField(fields, ["Layout Y", "Y"], fallback.y),
    w: numberField(fields, ["Layout W", "Width", "W"], fallback.w),
    h: numberField(fields, ["Layout H", "Height", "H"], fallback.h)
  };
}

function sortProducts(products) {
  return [...products].sort((a, b) => a.order - b.order);
}

function textField(fields, names) {
  const value = pick(fields, names);

  if (Array.isArray(value)) {
    return value.map((item) => textField({ item }, ["item"])).filter(Boolean).join(", ");
  }

  if (value && typeof value === "object") {
    if ("text" in value) {
      return String(value.text || "").trim();
    }

    if ("name" in value) {
      return String(value.name || "").trim();
    }
  }

  return String(value || "").trim();
}

function numberField(fields, names, fallback) {
  const value = pick(fields, names);
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanField(fields, names, fallback) {
  const value = pick(fields, names);

  if (typeof value === "boolean") {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return !["false", "0", "no", "нет"].includes(String(value).toLowerCase());
}

function imageField(fields, names) {
  const value = pick(fields, names);

  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return imageField({ value: value[0] }, ["value"]);
  }

  if (value.url) {
    return value.url;
  }

  if (value.external?.url) {
    return value.external.url;
  }

  if (value.file?.url) {
    return value.file.url;
  }

  return "";
}

function imageListField(fields, names) {
  const value = pick(fields, names);

  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return value ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => imageField({ item }, ["item"])).filter(Boolean);
  }

  return [imageField({ value }, ["value"])].filter(Boolean);
}

function notionFields(properties) {
  const fields = {};

  for (const [name, property] of Object.entries(properties)) {
    fields[name] = notionValue(property);
  }

  return fields;
}

function notionValue(property) {
  if (!property) {
    return "";
  }

  switch (property.type) {
    case "title":
    case "rich_text":
      return property[property.type].map((item) => item.plain_text).join("");
    case "number":
    case "checkbox":
    case "url":
      return property[property.type];
    case "select":
    case "status":
      return property[property.type]?.name || "";
    case "files":
      return property.files || [];
    default:
      return "";
  }
}

function pick(fields, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) {
      return fields[name];
    }
  }

  return undefined;
}

function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "");
}

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }

  return process.env[name];
}

const defaultLayouts = [
  { x: 32, y: 74, w: 274, h: 386 },
  { x: 366, y: 32, w: 197, h: 197 },
  { x: 520, y: 166, w: 365, h: 365 },
  { x: 928, y: 116, w: 320, h: 320 },
  { x: 0, y: 514, w: 488, h: 488 },
  { x: 720, y: 560, w: 430, h: 430 },
  { x: 350, y: 836, w: 337, h: 337 },
  { x: 608, y: 1100, w: 470, h: 470 },
  { x: 108, y: 1226, w: 395, h: 560 }
];
