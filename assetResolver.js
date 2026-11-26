// assetResolver.js — Carbon 2185 Database & GitHub Raw Asset Lookup Helper
const DEFAULT_DB_URL =
  "https://raw.githubusercontent.com/WarrenRe/carbasset/main/carbon2185-db.json";

export class AssetResolver {
  constructor(dbUrl = DEFAULT_DB_URL) {
    this.dbUrl = dbUrl;
    this.db = null;
    this.byName = new Map();
    this.bySlug = new Map();
    this.allEntities = [];
  }

  static toSlug(text) {
    return String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async init(forceRefresh = false) {
    if (this.db && !forceRefresh) return this.db;

    const cacheBust = forceRefresh ? `?t=${Date.now()}` : "";
    const response = await fetch(`${this.dbUrl}${cacheBust}`);
    if (!response.ok) {
      throw new Error(`Failed to load carbon2185-db.json (${response.status})`);
    }

    this.db = await response.json();
    this.byName.clear();
    this.bySlug.clear();
    this.allEntities = [];

    const collections = this.db.collections || {};
    for (const [category, items] of Object.entries(collections)) {
      for (const item of items) {
        const enriched = { ...item, category };
        this.allEntities.push(enriched);

        if (enriched.name) {
          this.byName.set(enriched.name.toLowerCase().trim(), enriched);
        }
        if (enriched.slug) {
          this.bySlug.set(enriched.slug, enriched);
        }
      }
    }

    return this.db;
  }

  getCollection(category) {
    return this.db?.collections?.[category] || [];
  }

  findByName(query, category = null) {
    if (!query) return null;
    const normalized = query.toLowerCase().trim();
    const slug = AssetResolver.toSlug(query);

    const pool = category ? this.getCollection(category) : this.allEntities;

    // 1. Exact name or slug match
    if (!category) {
      if (this.byName.has(normalized)) return this.byName.get(normalized);
      if (this.bySlug.has(slug)) return this.bySlug.get(slug);
    } else {
      const exact = pool.find(
        (e) =>
          e.name?.toLowerCase().trim() === normalized || e.slug === slug
      );
      if (exact) return exact;
    }

    // 2. Partial substring fallback (useful for voice commands)
    return (
      pool.find(
        (e) =>
          e.name?.toLowerCase().includes(normalized) ||
          e.slug?.includes(slug)
      ) || null
    );
  }

  findByTag(tag, category = null) {
    if (!tag) return [];
    const target = tag.toLowerCase().trim();
    const pool = category ? this.getCollection(category) : this.allEntities;

    return pool.filter((entity) =>
      (entity.tags_list || []).some((t) => t.toLowerCase().includes(target))
    );
  }

  resolveAssets(query, category = null) {
    const entity = this.findByName(query, category);
    if (!entity) return null;

    return {
      id: entity.id,
      name: entity.name,
      category: entity.category,
      tags: entity.tags_list || [],
      image2D: entity.image_2d || null,
      image360: entity.image_360 || null,
      image3D: entity.image_3d || null,
      imageAction: entity.image_action || null,
      imageStatus: entity.image_status || "READY",
      lore:
        entity.lore_bio_stats ||
        entity.backstory ||
        entity.visual_description_for_image_gen ||
        "",
      raw: entity,
    };
  }
}
