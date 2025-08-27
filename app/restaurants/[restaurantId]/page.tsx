"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Phone, Plus, Heart, Share } from "lucide-react";
import {
  restaurantsRepository,
  type Restaurant,
} from "@/features/restaurants/restaurants.repository";

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

// 숫자인지 판별
const isNumeric = (v: string) => /^\d+$/.test(v || "");

export default function RestaurantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const routeId = String(params?.id ?? ""); // ← 숫자/문자 모두 허용

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

        // 1) 숫자면 /:id 상세 시도
        if (isNumeric(routeId)) {
          try {
            detail = await restaurantsRepository.getRestaurant(routeId);
          } catch {
            detail = null;
          }
        }

        // 2) 숫자 상세가 실패했거나, routeId 자체가 문자열이면
        //    검색(q=routeId) 결과의 첫 항목으로 대체(서버가 문자열 id를 안 받는 경우 대비)
        if (!detail) {
          try {
            const list = await restaurantsRepository.getRestaurants({
              page: 1,
              limit: 1,
              q: routeId,
            });
            detail = list.items?.[0] ?? null;
          } catch {
            detail = null;
          }
        }

        if (!canceled) {
          if (detail) {
            setData(detail);
          } else {
            setErr("식당 정보를 불러오지 못했습니다.");
            setData(buildMock()); // 최종 폴백
          }
        }
      } catch (e: any) {
        if (!canceled) {
          setErr(e?.message || "식당 정보를 불러오지 못했습니다.");
          setData(buildMock());
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [routeId]);

  const categoryKo =
    data?.category === "KOREAN"
      ? "한식"
      : data?.category === "JAPANESE"
      ? "일식"
      : data?.category === "CHINESE"
      ? "중식"
      : "기타";

  const goCreate = () => {
    if (!data) return;
    const qs = new URLSearchParams({
      restaurant: data.name || "",
      location: data.address || "",
    }).toString();
    router.push(`/create?${qs}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        불러오는 중...
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {err || "데이터가 없습니다."}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={() => setFavorite((v) => !v)}>
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
          <img
            src="/placeholder.svg"
            alt={data.name}
            className="w-full h-64 md:h-80 object-cover rounded-lg"
          />
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
                <div className="flex items-center space-x-4 mb-3">
                  <Badge variant="outline">{categoryKo}</Badge>
                  {data.is_sponsored && <Badge>추천</Badge>}
                </div>
              </div>
            </div>

            <div className="space-y-3 mb-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <MapPin className="w-4 h-4" />
                <span>{data.address}</span>
              </div>
              {data.telephone && (
                <div className="flex items-center space-x-2">
                  <Phone className="w-4 h-4" />
                  <span>{data.telephone}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button className="flex-1" onClick={goCreate}>
                <Plus className="w-4 h-4 mr-2" />
                이 식당에서 밥약 만들기
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
