// app/restaurants/helpers.ts
"use client";

import type { ReadonlyURLSearchParams } from "next/navigation";

/**
 * 식당을 선택했을 때 이동할 다음 URL을 계산한다.
 * - 편집에서 온 경우(mode=select & return=...) → return 으로 복귀 + ?restaurantId=...
 * - 그 외(일반 플로우) → /create?id=&name=&address=
 */
export function nextUrlAfterSelect(
  searchParams: ReadonlyURLSearchParams,
  restaurant: { id: number | string; name?: string | null; address?: string | null }
) {
  const mode = searchParams.get("mode");
  const ret = searchParams.get("return");

  if (mode === "select" && ret) {
    // 편집 페이지로 되돌아가며 restaurantId를 붙여준다.
    const decoded = decodeURIComponent(ret);
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = new URL(decoded, origin);
    url.searchParams.set("restaurantId", String(restaurant.id));
    return url.pathname + (url.search ? `?${url.searchParams.toString()}` : "");
  }

  // 기본: 생성 페이지로 이동하면서 식당 정보 전달
  const qs = new URLSearchParams();
  qs.set("id", String(restaurant.id));
  if (restaurant.name) qs.set("name", restaurant.name);
  if (restaurant.address) qs.set("address", restaurant.address);
  return `/create?${qs.toString()}`;
}
