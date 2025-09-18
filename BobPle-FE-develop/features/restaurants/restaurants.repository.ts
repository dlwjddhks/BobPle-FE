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

/** 서버 응답의 다양한 스펙을 안전하게 정규화 */
function normalizeItem(raw: any, fallbackId?: number | string): Restaurant {
  const v = String(raw?.category ?? raw?.cat ?? "").toLowerCase();
  const category =
    v === "korean" ? "KOREAN" :
    v === "japanese" ? "JAPANESE" :
    v === "chinese" ? "CHINESE" : (raw?.category ?? "ETC");

  const isSponsoredRaw = raw?.is_sponsored ?? raw?.isSponsored ?? raw?.sponsored ?? false;

  const idRaw =
    raw?.id ?? raw?._id ?? raw?.rid ?? raw?.restaurantId ?? fallbackId;

  return {
    id: typeof idRaw === "string" && /^\d+$/.test(idRaw) ? Number(idRaw) : idRaw,
    name: raw?.name ?? "이름없음",
    category,
    address: raw?.address ?? null,
    telephone: raw?.telephone ?? null,
    is_sponsored: isSponsoredRaw === true || isSponsoredRaw === "true",
  };
}

function extractArray(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.restaurants)) return res.restaurants;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.results)) return res.results;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.success?.lists)) return res.success.lists; // ← 네 서버 형태
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
  // 서버의 다양한 파라미터 이름을 모두 채워줘서 호환성 확보
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
  if (params.sponsoredOnly !== undefined && params.sponsoredOnly !== null) {
    const v = String(params.sponsoredOnly);
    sp.set("sponsoredOnly", v); sp.set("isSponsored", v); sp.set("recommendedOnly", v);
  }
  sp.set("_t", String(Date.now()));
  return sp.toString();
}

export const restaurantsRepository = {
  /** 기본 목록 */
  async getRestaurants(params: {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  sponsoredOnly?: string | number | boolean;
} = {}): Promise<RestaurantPage> {
  const page  = params.page  ?? 1;
  const limit = params.limit ?? 5;

  const qs = buildQuery({
    page,
    limit,
    q: params.q,
    category: params.category,
    sponsoredOnly: params.sponsoredOnly,
  });

  let res: any;
  try {
    res = await apiRequest(`/api/restaurants?${qs}`);
  } catch (e) {
    console.debug('[DEBUG][restaurants] request failed:', e);
    // 실패 시 빈 목록으로 리턴(화면이 안죽도록)
    return { items: [], page, limit, hasNext: false, total: 0 };
  }

  // 원본 찍기
  console.debug('[DEBUG][restaurants] raw response:', res);

  // 배열 꺼내기
  const rawArr = extractArray(res);
  console.debug(
    '[DEBUG][restaurants] first item keys:',
    rawArr?.[0] ? Object.keys(rawArr[0]) : '(none)'
  );

  // ✅ 반드시 람다로 감싸서 한 개 인자만 전달 (TS 인자수 문제/인덱스 주입 방지)
  const arr = rawArr.map((row: any) => normalizeItem(row));

  // total/hasNext 계산
  const total = extractTotal(res);
  const baseHasNext =
    typeof total === 'number' ? page * limit < total : arr.length === limit;
  const hasNext = extractHasNext(res, baseHasNext);

  return { items: arr, page, limit, hasNext, total };
},

  /** 추천 전용(스폰서만) */
  async getRestaurantRecommends(page = 1, limit = 5): Promise<RestaurantPage> {
    return this.getRestaurants({ page, limit, sponsoredOnly: 1 });
  },

  /** 단건 조회 */
  async getRestaurant(id: number | string): Promise<Restaurant> {
    const res = await apiRequest(`/api/restaurants/${id}`);

    // 1) swagger/BE가 { success: {...} } 혹은 { data: {...} } 로 주는 케이스 처리
    const row = (res && typeof res === "object" && (res as any).success)
      ? (res as any).success
      : (res && typeof res === "object" && (res as any).data)
      ? (res as any).data
      : res;

    // 2) 혹시 배열로 오는 케이스도 방어
    const arr = Array.isArray(row) ? row : (Array.isArray((row as any)?.items) ? (row as any).items : null);
    const picked = arr && arr.length ? arr[0] : row;

    // 3) id를 BE가 안 줄 수도 있어, 파라미터로 보정
    const normalized = normalizeItem(picked);
    if (normalized.id == null) normalized.id = typeof id === "number" ? id : Number(id) || id;

    return normalized;
  },

  /**
   * 카테고리 수집 페이징
   * - 서버가 카테고리 필터를 지원해도, 안전하게 클라이언트에서도 한 번 더 거르며 페이지 구간을 slice
   */
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
        // 서버에도 힌트를 주되, 최종 필터는 아래 batch에서 보장
        category: target,
        sponsoredOnly,
      });

      const batch = r.items.filter(it => String(it.category || "").toUpperCase() === target);
      collected = collected.concat(batch);

      keepGoing = r.hasNext || r.items.length === limit;
      cursor += 1;
      looked += 1;
    }

    const start = (page - 1) * limit;
    const end   = start + limit;
    const pageItems = collected.slice(start, end);

    const hasNext = collected.length > end;

    return { items: pageItems, page, limit, hasNext, total: collected.length };
  },
};
