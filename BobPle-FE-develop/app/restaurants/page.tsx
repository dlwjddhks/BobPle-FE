// app/restaurants/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, MapPin } from "lucide-react";
import { restaurantsRepository, type Restaurant } from "@/features/restaurants/restaurants.repository";

function buildMock(): Restaurant {
  return {
    id: 999999,
    name: "목업) 밥맛 좋은집",
    category: "KOREAN",
    address: "서울 어딘가 123",
    telephone: "02-000-0000",
    is_sponsored: true,
  };
}
const koToServerCat = (k?: string) => {
  switch (k) {
    case "한식": return "KOREAN";
    case "일식": return "JAPANESE";
    case "중식": return "CHINESE";
    case "양식": return "WESTERN";
    default:     return undefined;
  }
};
const serverToKoCat = (c?: string) => {
  const v = (c || "").toUpperCase();
  if (v === "KOREAN")   return "한식";
  if (v === "JAPANESE") return "일식";
  if (v === "CHINESE")  return "중식";
  return "양식";
};

export default function RestaurantsPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); // ✅ 쿼리 유지용

  const [serverList, setServerList] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("전체");
  const categories = ["전체", "한식", "일식", "중식", "양식"];

  const [page, setPage] = useState(1);
  const limit = 5;
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => { setPage(1); }, [recommendedOnly, selectedCategory, searchTerm]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const categoryCode = koToServerCat(selectedCategory);
        const params = {
          page,
          limit,
          q: searchTerm.trim() || undefined,
          sponsoredOnly: recommendedOnly ? 1 : 0,
        } as const;

        const resp = categoryCode
          ? await restaurantsRepository.collectByCategory({
              ...params,
              category: categoryCode,
              maxPages: 50,
            })
          : await restaurantsRepository.getRestaurants(params);

        if (canceled) return;

        const list = resp.items ?? [];
        setServerList(list);
        setHasNext(Boolean(resp.hasNext));

        if (list.length === 0 && page === 1) {
          setErr("검색 결과가 비어 있어 목업 데이터를 보여드립니다.");
          setServerList([buildMock()]);
        }
      } catch (e: any) {
        if (!canceled) {
          setErr(e?.message || "식당 목록을 불러오지 못했습니다.");
          setServerList([buildMock()]);
          setHasNext(false);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [recommendedOnly, selectedCategory, searchTerm, page]);

  const viewList = useMemo(() => {
    return serverList.map((r) => ({
      id: r.id,
      name: r.name,
      category: serverToKoCat(r.category),
      location: r.address,
      phone: r.telephone ?? undefined,
      isRecommended: !!r.is_sponsored,
    }));
  }, [serverList]);

  // ✅ 현재 목록의 쿼리스트링을 상세로 고스란히 전달
  const qs = searchParams?.toString();
  const tail = qs ? `?${qs}` : "";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-xl font-semibold">식당 찾기</h1>
            <div className="ml-auto">
              <Button
                size="sm"
                variant={recommendedOnly ? "default" : "outline"}
                onClick={() => setRecommendedOnly((v) => !v)}
              >
                {recommendedOnly ? "추천만 보기 ON" : "추천만 보기 OFF"}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* 검색 */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="식당 이름, 음식 종류, 지역으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* 카테고리 */}
        <div className="mb-6 bg-card p-4 rounded-lg border">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">카테고리</h3>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="text-sm font-medium"
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        {err && (
          <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {err}
          </div>
        )}
        {loading && <div className="text-sm text-muted-foreground">불러오는 중...</div>}

        {/* 목록 */}
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {viewList.map((restaurant) => (
              <Card
                key={restaurant.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => router.push(`/restaurants/${restaurant.id}${tail}`)} // ✅ 쿼리 유지
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                        {restaurant.name}
                        {restaurant.isRecommended && (
                          <Badge className="text-[11px] px-2 py-0.5">추천</Badge>
                        )}
                      </h3>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
                        <Badge variant="outline" className="text-xs">
                          {restaurant.category}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      {restaurant.location}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!loading && !err && viewList.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">이 페이지에는 더 이상 결과가 없어요.</p>
            </div>
          )}

          {/* 페이지네이션 */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              이전
            </Button>
            <span className="text-sm text-muted-foreground">페이지 {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
