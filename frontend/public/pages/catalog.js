async function home() {
  movies = await api("/movies");
  const featured = movies.filter((m) => m.poster);
  const lead = featured[0] || movies[0];
  layout(
    `<div class="home-page"><section class="home-hero"><div class="home-hero-copy"><div class="home-kicker"><span class="home-dot"></span> CineVerse / Lịch chiếu</div><h1>Một tối ở rạp<br>bắt đầu <em>từ đây.</em></h1><p>Chọn phim và suất chiếu phù hợp với buổi tối của bạn.</p><button class="home-hero-action" id="explore">Khám phá phim <span aria-hidden="true">↗</span></button><div class="home-hero-foot">PHIM NỔI BẬT <span>01 / ${String(movies.length).padStart(2, "0")}</span></div></div><div class="home-feature" style="background-color:${esc(lead?.color || "#272b35")}">${lead?.poster ? `<img src="${esc(lead.poster)}" alt="Poster ${esc(lead.title)}" onerror="this.style.display='none'">` : ""}<div class="home-feature-caption"><span>TRÊN MÀN ẢNH</span><strong>${esc(lead?.title || "CineVerse")}</strong></div></div></section><section class="movie-section" id="films"><div class="movie-section-head"><div><div class="home-kicker"><span class="home-dot"></span> Chọn bộ phim của bạn</div><h2>Phim đang chiếu<span class="movie-count">${String(movies.length).padStart(2, "0")}</span></h2></div><p>Danh sách phim và lịch chiếu minh họa</p></div><div class="movie-grid">${movies.map((m, i) => `<article class="movie-card"><div class="movie-poster" style="background-color:${esc(m.color)}">${m.poster ? `<img src="${esc(m.poster)}" alt="Poster ${esc(m.title)}" loading="lazy" onerror="this.style.display='none'">` : ""}<span class="movie-number">${String(i + 1).padStart(2, "0")}</span><span class="movie-rating">${esc(m.rating)}</span></div><div class="movie-info"><div class="movie-genre">${esc(m.genre)} <span>·</span> ${m.duration} phút</div><h3 title="${esc(m.title)}">${esc(m.title)}</h3><p>${esc(m.description)}</p><button class="movie-action" data-movie="${m.id}">Xem lịch chiếu <span aria-hidden="true">↗</span></button></div></article>`).join("")}</div></section></div>`,
  );
  // Phim nổi bật: tự chuyển phim và cho phép lướt bằng nút mũi tên.
  const slides = featured.length ? featured : movies;
  const hero = document.querySelector(".home-feature");
  const controls = document.querySelector(".home-hero-foot");
  if (slides.length) {
    controls.innerHTML = `<span>PHIM NỔI BẬT</span><div class="feature-controls"><button id="feature-prev" aria-label="Phim trước">←</button><span id="feature-count"></span><button id="feature-next" aria-label="Phim tiếp theo">→</button></div>`;
    let current = 0;
    const showFeatured = (index) => {
      current = (index + slides.length) % slides.length;
      const movie = slides[current];
      hero.style.backgroundColor = movie.color || "#272b35";
      hero.innerHTML = `${movie.poster ? `<img src="${esc(movie.poster)}" alt="Poster ${esc(movie.title)}" onerror="this.style.display='none'">` : ""}<div class="home-feature-caption"><span>TRÊN MÀN ẢNH</span><strong>${esc(movie.title)}</strong></div>`;
      document.querySelector("#feature-count").textContent = `${String(current + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
    };
    document.querySelector("#feature-prev").onclick = () => showFeatured(current - 1);
    document.querySelector("#feature-next").onclick = () => showFeatured(current + 1);
    showFeatured(0);
    timer = setInterval(() => showFeatured(current + 1), 6000);
  }
  $("#explore").onclick = () =>
    $("#films").scrollIntoView({ behavior: "smooth" });
  document.querySelectorAll("[data-movie]").forEach(
    (x) =>
      (x.onclick = () => {
        activeMovie = x.dataset.movie;
        navigate("movie");
      }),
  );
}
async function moviePage() {
  const m = movies.find((x) => x.id === activeMovie);
  if (!m) return navigate("home");
  showtimes = await api("/showtimes?movieId=" + encodeURIComponent(m.id));
  layout(
    `<a class="back" href="#" id="back">← Danh sách phim</a><h1 class="page-title">${esc(m.title)}</h1><div class="two movie-detail"><div class="panel"><div class="eyebrow">Chọn suất chiếu</div><p class="muted">${esc(m.genre)} · ${m.duration} phút · ${esc(m.rating)}</p><p>${esc(m.description)}</p><h3>Suất chiếu sắp tới</h3><div class="times">${showtimes.length ? showtimes.map((s) => `<button class="chip" data-show="${s.id}">${date(s.startAt)}<br><small>${esc(s.room)}</small></button>`).join("") : "Chưa có suất chiếu sắp tới"}</div></div><aside class="panel"><h3>Thông tin đặt vé</h3><p class="muted">Chọn suất chiếu, tối đa 6 ghế mỗi đơn. Bạn sẽ xem lại thông tin trước khi chuyển sang VNPay.</p></aside></div>`,
  );
  $("#back").onclick = (e) => {
    e.preventDefault();
    navigate("home");
  };
  document.querySelectorAll("[data-show]").forEach(
    (x) =>
      (x.onclick = () => {
        activeShow = x.dataset.show;
        navigate("seats");
      }),
  );
}
// Đặt vé: chọn ghế rồi chuyển thẳng đến cổng thanh toán.
