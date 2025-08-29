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

// 폴백 데이터
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

const isNumeric = (v: string) => /^\d+$/.test(v || "");

export default function RestaurantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const routeId = String(params?.restaurantId ?? "");

  const [data, setData] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);

  // **URL 파라미터 로그**
  useEffect(() => {
    console.log("[LOG] URL 파라미터 routeId =", routeId);
  }, [routeId]);

  // 데이터 패치
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        let detail: Restaurant | null = null;

        // 1) 숫자 id로 조회
        if (isNumeric(routeId)) {
          try {
            detail = await restaurantsRepository.getRestaurant(Number(routeId));
            console.log("[LOG] getRestaurant by id:", Number(routeId), detail);
          } catch (e) {
            console.log("[LOG] getRestaurant 실패, fallback to search:", e);
          }
        }

        // 2) 이름 검색 fallback
        if (!detail) {
          try {
            const list = await restaurantsRepository.getRestaurants({
              page: 1,
              limit: 1,
              q: routeId,
            });
            detail = list.items?.[0] ?? null;
            console.log("[LOG] fallback 검색 결과:", routeId, list);
          } catch (e) {
            console.log("[LOG] fallback 검색 실패:", e);
          }
        }

        if (!canceled) {
          if (detail) {
            setData(detail);
            console.log("[LOG] 최종 data 상태:", detail);
          } else {
            setErr("식당 정보를 불러오지 못했습니다.");
            setData(buildMock());
            console.log("[LOG] 최종 data 상태: mock 데이터로 대체");
          }
        }
      } catch (e: any) {
        if (!canceled) {
          setErr(e?.message || "식당 정보를 불러오지 못했습니다.");
          setData(buildMock());
          console.log("[LOG] 에러 발생:", e);
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

  // **생성 페이지로 이동할 때 로그**
  const goCreate = () => {
    if (!data) return;
    const qs = new URLSearchParams({
      id: String(data.id ?? ""),
      name: data.name ?? "",
      address: data.address ?? "",
    });
    const target = `/create?${qs.toString()}`;
    console.log("[LOG] 생성 페이지로 이동:", {
      id: String(data.id ?? ""),
      name: data.name ?? "",
      address: data.address ?? "",
      url: target,
    });
    router.push(target);
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
