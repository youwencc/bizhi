/* ============================================================
   home.js — 首页逻辑
   依赖 common.js（WallUI）
   职责：分类渲染 / 壁纸网格渲染 / 搜索 / 底部导航
   ============================================================ */
(function () {
    "use strict";

    /* ============================================================
       状态
       ============================================================ */
    var activeCategory = "all";
    var searchQuery = "";
    var grid = null;
    var site = null;

    /* ============================================================
       渲染：分类条
       ============================================================ */
    function renderCategories() {
        var nav = document.getElementById("categoryNav");
        if (!nav) return;
        nav.innerHTML = WallUI.getCategories().map(function (c) {
            var active = c.key === activeCategory ? " active" : "";
            return '<button class="category-chip' + active + '" data-category="' + WallUI.esc(c.key) + '">' + WallUI.esc(c.label) + '</button>';
        }).join("");
    }

    /* 顶部导航菜单高亮与当前分类联动 */
    function syncHeaderNav() {
        var nav = document.getElementById("headerNav");
        if (!nav) return;
        nav.querySelectorAll(".nav-link").forEach(function (a) {
            a.classList.toggle("active", (a.dataset.cat || "all") === activeCategory);
        });
    }

    /* ============================================================
       渲染：壁纸网格
       ============================================================ */
    function renderWallpapers() {
        var q = searchQuery.toLowerCase();
        var filtered = WallUI.getWallpapers().filter(function (item) {
            var matchCat = activeCategory === "all" || item.category === activeCategory;
            var catLabel = (WallUI.categoryLabel(item.category) || "").toLowerCase();
            var matchSearch = !q ||
                String(item.title).toLowerCase().indexOf(q) !== -1 ||
                catLabel.indexOf(q) !== -1;
            return matchCat && matchSearch;
        });

        if (filtered.length === 0) {
            grid.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-icon">🔍</div>' +
                    '<p>没有找到匹配的壁纸</p>' +
                '</div>';
            return;
        }

        grid.innerHTML = filtered.map(function (item, i) {
            var delay = Math.min(i * 0.045, 0.5).toFixed(3);
            var fallbackSeed = "fb" + item.id;
            return (
                '<a class="wallpaper-card"' +
                    ' style="animation-delay:' + delay + 's"' +
                    ' href="' + WallUI.esc(WallUI.cardLink(item)) + '"' +
                    ' aria-label="' + WallUI.esc(item.title) + '">' +
                    '<img src="' + WallUI.esc(WallUI.cardImage(item)) + '"' +
                        ' alt="' + WallUI.esc(item.title) + '" loading="lazy"' +
                        ' onerror="this.onerror=null;this.src=\'https://picsum.photos/seed/' + fallbackSeed + '/400/711\'">' +
                    '<div class="badge">' + WallUI.esc(WallUI.categoryLabel(item.category)) + '</div>' +
                    '<div class="dl-hint">⬇</div>' +
                    '<div class="overlay">' +
                        '<div class="title">' + WallUI.esc(item.title) + '</div>' +
                        '<div class="resolution">' + WallUI.esc(item.resolution || "") + '</div>' +
                    '</div>' +
                '</a>'
            );
        }).join("");
    }

    /* ============================================================
       初始化
       ============================================================ */
    WallUI.loadData().then(function () {
        site = WallUI.site;

        WallUI.renderHeader("home");
        WallUI.renderFooter({ bottomNav: true });
        WallUI.applyHomeSEO();
        WallUI.mountAnalytics(site.analytics);

        grid = document.getElementById("wallpaperGrid");
        var searchInput = document.getElementById("searchInput");
        var clearBtn = document.getElementById("clearBtn");
        var categoryNav = document.getElementById("categoryNav");

        /* 初始分类：支持顶部导航 ?cat= 直达（无效值回退"全部"） */
        var initCat = WallUI.qs("cat");
        if (initCat && initCat !== "all") {
            var known = WallUI.getCategories().some(function (c) { return c.key === initCat; });
            if (known) activeCategory = initCat;
        }

        /* 分类条 */
        renderCategories();
        syncHeaderNav();
        categoryNav.addEventListener("click", function (e) {
            var chip = e.target.closest(".category-chip");
            if (!chip) return;
            categoryNav.querySelectorAll(".category-chip").forEach(function (c) {
                c.classList.remove("active");
            });
            chip.classList.add("active");
            activeCategory = chip.dataset.category;
            syncHeaderNav();
            renderWallpapers();
        });

        /* 搜索 */
        searchInput.addEventListener("input", function (e) {
            searchQuery = e.target.value.trim();
            clearBtn.style.display = searchQuery ? "block" : "none";
            renderWallpapers();
        });

        clearBtn.addEventListener("click", function () {
            searchInput.value = "";
            searchQuery = "";
            clearBtn.style.display = "none";
            renderWallpapers();
            searchInput.focus();
        });

        /* 底部导航（装饰性，与原版一致） */
        document.querySelectorAll(".nav-item").forEach(function (item) {
            item.addEventListener("click", function () {
                document.querySelectorAll(".nav-item").forEach(function (i) {
                    i.classList.remove("active");
                });
                item.classList.add("active");
            });
        });

        renderWallpapers();
    });
})();
