"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Heart, MapPin, Phone, Plus, Share } from "lucide-react";
import { restaurantsRepository, type Restaurant } from "@/features/restaurants/restaurants.repository";

function buildMock(): Restaurant {
  return { id: 999999, name: "목업) 밥맛 좋은집", category: "KOREAN", address: "서울 어딘가 123", telephone: "02-000-0000", is_sponsored: true };
}
const isNumeric = (v: string) => /^\d+$/.test(v || "");

export default function RestaurantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();

  const routeId = String((params as any)?.restaurantId ?? "");

  // ✅ 쿼리 우선, 없으면 세션 폴백
  const { mode, returnUrl } = useMemo(() => {
    const qMode = sp?.get("mode") || "";
    const qReturn = sp?.get("return") || "";
    let sMode = "", sReturn = "";
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem("restaurantSelectCtx");
        if (raw) {
          const ctx = JSON.parse(raw);
          sMode = ctx?.mode || "";
          sReturn = ctx?.return || "";
        }
      } catch {}
    }
    return {
      mode: qMode || sMode,                          // "select" or ""
      returnUrl: qReturn || sReturn || "/create",    // 기본은 /create
    };
  }, [sp]);

  const [data, setData] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        let detail: Restaurant | null = null;

        if (isNumeric(routeId)) {
          try { detail = await restaurantsRepository.getRestaurant(Number(routeId)); } catch {}
        }
        if (!detail) {
          try {
            const list = await restaurantsRepository.getRestaurants({ page: 1, limit: 1, q: routeId });
            detail = list.items?.[0] ?? null;
          } catch {}
        }
        if (!canceled) setData(detail ?? buildMock());
      } catch (e: any) {
        if (!canceled) { setErr(e?.message || "식당 정보를 불러오지 못했습니다."); setData(buildMock()); }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [routeId]);

  const categoryKo =
    data?.category === "KOREAN" ? "한식" :
    data?.category === "JAPANESE" ? "일식" :
    data?.category === "CHINESE" ? "중식" : "기타";

  const goCreate = () => {
    if (!data) return;
    const qs = new URLSearchParams({
      id: String(data.id ?? ""),
      name: data.name ?? "",
      address: data.address ?? "",
    });
    router.push(`/create?${qs.toString()}`);
  };

  // ✅ 선택 → return 으로 이동 + 세션 정리
  const selectAndReturn = () => {
    if (!data) return;
    if (typeof window !== "undefined") sessionStorage.removeItem("restaurantSelectCtx");
    router.push(`${returnUrl}?restaurantId=${encodeURIComponent(String(data.id))}`);
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">불러오는 중...</div>;
  if (!data) return <div className="min-h-screen grid place-items-center text-destructive">{err || "데이터가 없습니다."}</div>;

  const isSelectMode = mode === "select";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setFavorite(v => !v)}>
                <Heart className={`w-4 h-4 ${favorite ? "fill-current text-red-500" : ""}`} />
              </Button>
              <Button variant="ghost" size="sm">
                <Share className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="mb-6">
          <img src="/placeholder.svg" alt={data.name} className="w-full h-64 md:h-80 object-cover rounded-lg" />
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            {err && (
              <div className="mb-4 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {err}
              </div>
            )}

            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-2xl font-bold mb-2">{data.name}</h1>
                <div className="flex items-center gap-4 mb-3">
                  <Badge variant="outline">{categoryKo}</Badge>
                  {data.is_sponsored && <Badge>추천</Badge>}
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /><span>{data.address}</span></div>
              {data.telephone && <div className="flex items-center gap-2"><Phone className="w-4 h-4" /><span>{data.telephone}</span></div>}
            </div>

            <div className="flex gap-3">
              {isSelectMode ? (
                <Button className="flex-1" onClick={selectAndReturn}>
                  <Check className="w-4 h-4 mr-2" />
                  이 식당 선택하기
                </Button>
              ) : (
                <Button className="flex-1" onClick={goCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  이 식당에서 밥약 만들기
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
