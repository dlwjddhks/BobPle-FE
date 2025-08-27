import { apiRequest } from "@/lib/api";

export type Restaurant = {
  id?: number | string;
  name: string;
  category?: "KOREAN" | "JAPANESE" | "CHINESE" | string;
  address?: string | null;
  telephone?: string | null;
  is_sponsored?: boolean;
};

export type RestaurantPage = {
  items: Restaurant[];
  page: number;
  limit: number;
  hasNext: boolean;
  total?: number;
};

function normalizeItem(raw: any): Restaurant {
  const v = String(raw?.category ?? raw?.cat ?? "").toLowerCase();
  const category =
    v === "korean" ? "KOREAN" :
    v === "japanese" ? "JAPANESE" :
    v === "chinese" ? "CHINESE" : (raw?.category ?? "ETC");

  const isSponsored = raw?.is_sponsored ?? raw?.isSponsored ?? raw?.sponsored ?? false;

  return {
    id: raw?.id ?? raw?._id ?? raw?.rid ?? raw?.restaurantId ?? raw?.name,
    name: raw?.name ?? "이름없음",
    category,
    address: raw?.address ?? null,
    telephone: raw?.telephone ?? null,
    is_sponsored: Boolean(isSponsored),
  };
}

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.restaurants)) return res.restaurants;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.success?.lists)) return res.success.lists;
  return [];
}
function extractTotal(res: any): number | undefined {
  return (
    res?.total ?? res?.totalCount ?? res?.count ??
    res?.success?.total ?? res?.success?.pagination?.total ?? undefined
  );
}
function extractHasNext(res: any, fallback: boolean): boolean {
  const direct =
    res?.hasNext ?? res?.has_next ?? res?.success?.hasNext ?? res?.success?.pagination?.hasNext;
  if (typeof direct === "boolean") return direct;
  return fallback;
}

function buildQuery(params: {
  page: number; limit: number; q?: string; category?: string; sponsoredOnly?: string|number|boolean;
}) {
  const sp = new URLSearchParams();
  sp.set("page", String(params.page));
  sp.set("limit", String(params.limit));
  sp.set("size", String(params.limit));
  sp.set("perPage", String(params.limit));
  sp.set("pageSize", String(params.limit));
  sp.set("countPerPage", String(params.limit));
  if (params.q) { sp.set("q", params.q); sp.set("query", params.q); sp.set("keyword", params.q); }
  if (params.category && params.category !== "ALL") {
    const c = String(params.category);
    sp.set("category", c); sp.set("cat", c); sp.set("CATEGORY", c);
  }
  if (params.sponsoredOnly) {
    const v = String(params.sponsoredOnly);
    sp.set("sponsoredOnly", v); sp.set("isSponsored", v); sp.set("recommendedOnly", v);
  }
  sp.set("_t", String(Date.now()));
  return sp.toString();
}

export const restaurantsRepository = {
  async getRestaurants(params: {
    page?: number; limit?: number; q?: string; category?: string; sponsoredOnly?: string|number|boolean;
  } = {}): Promise<RestaurantPage> {
    const page  = params.page  ?? 1;
    const limit = params.limit ?? 5;

    const qs  = buildQuery({ page, limit, q: params.q, category: params.category, sponsoredOnly: params.sponsoredOnly });
    const res = await apiRequest(`/api/restaurants?${qs}`);
    const arr = extractArray(res).map(normalizeItem);
    const total = extractTotal(res);

    // 총합이 있으면 그것으로, 없으면 길이로 추정
    const baseHasNext = typeof total === "number" ? page * limit < total : arr.length === limit;
    const hasNext = extractHasNext(res, baseHasNext);

    return { items: arr, page, limit, hasNext, total };
  },

  async getRestaurantRecommends(page = 1, limit = 5): Promise<RestaurantPage> {
    return this.getRestaurants({ page, limit, sponsoredOnly: 1 });
  },

  async getRestaurant(id: number | string): Promise<Restaurant> {
    const res = await apiRequest(`/api/restaurants/${id}`);
    const arr = extractArray(res);
    return arr.length ? normalizeItem(arr[0]) : normalizeItem(res);
  },

  // ★ 카테고리 폴백(필터된 결과 기준 페이지네이션)
  async collectByCategory(params: {
    page: number;
    limit: number;
    category: "KOREAN" | "JAPANESE" | "CHINESE" | string;
    q?: string;
    sponsoredOnly?: string|number|boolean;
    maxPages?: number;
  }): Promise<RestaurantPage> {
    const { page, limit, category, q, sponsoredOnly } = params;
    const maxPages = params.maxPages ?? 50;

    const target = String(category).toUpperCase();
    const needUntil = page * limit;

    let collected: Restaurant[] = [];
    let cursor = 1;
    let looked = 0;
    let keepGoing = true;

    while (collected.length < needUntil && keepGoing && looked < maxPages) {
      const r = await this.getRestaurants({
        page: cursor,
        limit,
        q,
        category: target,      // 서버가 이해하면 비용 절약
        sponsoredOnly,
      });

      // 현재 배치에서만 필터
      const batch = r.items.filter(it => String(it.category || "").toUpperCase() === target);
      collected = collected.concat(batch);

      // 다음 루프 조건: 서버가 hasNext 주면 그대로, 없으면 r.items 길이로 추정
      keepGoing = r.hasNext || r.items.length === limit;
      cursor += 1;
      looked += 1;
    }

    const start = (page - 1) * limit;
    const end   = start + limit;
    const pageItems = collected.slice(start, end);

    // 다음 페이지 존재 여부: 수집된 총량 기준으로 엄격하게 판단
    const hasNext = collected.length > end;

    return { items: pageItems, page, limit, hasNext, total: collected.length };
  },
};
