export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 여기서 Render BE로 주소 바꿔줌
  url.hostname = "bobple-be.onrender.com";  // ← Render에 배포된 BE 주소
  url.protocol = "https:";
  url.pathname = url.pathname.replace(/^\/_be/, ""); 

  return fetch(new Request(url, request)); // 프록시 (HTTP + WS 다 지원)
}