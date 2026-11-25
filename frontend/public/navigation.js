async function navigate(p, options = {}) {
  page = p;
  clearInterval(timer);
  try {
    if (p === "home") return await home();
    if (p === "movie") return await moviePage();
    if (p === "seats") return await seatPage(options.preserveSelection);
    if (p === "review") return await reviewPage();
    if (p === "login" || p === "register") return authPage(p);
    if (p === "verify") return verifyPage();
    if (p === "settings") return settingsPage();
    if (p === "bookings") return await bookingsPage();
    if (p === "ticket") return await ticketPage();
    if (p === "admin") {
      await adminPage();
      return adminCheckin();
    }
  } catch (e) {
    toast(e);
    if (p !== "home") navigate("home");
  }
}
