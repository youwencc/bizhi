/* ============================================================
   common.js — 全站公共脚本
   职责：
     1. 加载站点数据（assets/data/site.json + wallpapers.json）
     2. 应用 SEO 信息（title / meta / OG 标签，由后台配置）
     3. 注入公共头部 / 页尾（纯静态站的"公共模板"方案）
     4. 工具函数（toast、转义、图片地址、下载地址等）
   页面专属逻辑见 home.js（首页）、download.js（下载页）
   ============================================================ */
(function () {
    "use strict";

    /* ------------------------------------------------------------
       内置兜底数据：assets/data/*.json 加载失败时使用
       （例如本地 file:// 直接打开页面，fetch 被浏览器拦截的场景）
       正式数据以虚拟主机后台（MySQL）生成的 JSON 为准
       ------------------------------------------------------------ */
    var FALLBACK_SITE = {
        version: 1,
        site_url: "https://weget.site",
        site_name: "WallGallery",
        logo_emoji: "📱",
        home_title: "WallGallery · 手机壁纸精选",
        home_description: "精选高清手机壁纸免费下载，支持多规格一键保存。",
        home_keywords: "手机壁纸,高清壁纸,壁纸下载",
        download_title_template: "{title} - 高清手机壁纸下载 | WallGallery",
        download_description: "免费下载高清手机壁纸《{title}》，多分辨率一键保存。",
        footer_text: "© 2026 WallGallery · 精选手机壁纸",
        icp: "",
        analytics: "",
        enable_tablet: "0",
        enable_desktop: "0"
    };

    var FALLBACK_CATEGORIES = [
        { key: "anime", label: "动漫" },
        { key: "nature", label: "自然" },
        { key: "minimal", label: "极简" },
        { key: "city", label: "城市" },
        { key: "abstract", label: "抽象" },
        { key: "animal", label: "动物" },
        { key: "dark", label: "暗黑" }
    ];

    /* ------------------------------------------------------------
       命名空间
       ------------------------------------------------------------ */
    var WallUI = {};
    window.WallUI = WallUI;

    /* ============================================================
       工具函数
       ============================================================ */

    /* HTML 转义（所有后台录入数据渲染前必须过一遍） */
    WallUI.esc = function (s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    };

    /* 读取 URL 查询参数 */
    WallUI.qs = function (name) {
        return new URLSearchParams(location.search).get(name);
    };

    /* picsum 占位图（未配置真实图片时的兜底） */
    WallUI.imageUrl = function (seed, w, h) {
        return "https://picsum.photos/seed/" + encodeURIComponent(seed) + "/" + w + "/" + h;
    };

    /* 提示条 */
    var toastEl = null;
    var toastTimer = null;
    WallUI.toast = function (msg) {
        if (!toastEl) {
            toastEl = document.getElementById("toast");
            if (!toastEl) {
                toastEl = document.createElement("div");
                toastEl.className = "toast";
                document.body.appendChild(toastEl);
            }
        }
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2000);
    };

    /* ============================================================
       数据层
       ============================================================ */
    function fetchJSON(url) {
        return fetch(url, { cache: "no-cache" }).then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        });
    }

    /* 加载站点数据；任一文件失败则整组回退到内置数据 */
    WallUI.loadData = function () {
        return Promise.all([
            fetchJSON("assets/data/site.json").catch(function () { return null; }),
            fetchJSON("assets/data/wallpapers.json").catch(function () { return null; })
        ]).then(function (rs) {
            WallUI.site = rs[0] || FALLBACK_SITE;
            if (rs[1]) {
                WallUI.data = rs[1];
            } else {
                console.warn("[WallUI] 数据文件加载失败，使用内置兜底数据（本地直接打开请用 http 服务预览）");
                WallUI.data = { version: 0, categories: FALLBACK_CATEGORIES, wallpapers: FALLBACK_WALLPAPERS };
            }
            return { site: WallUI.site, data: WallUI.data };
        });
    };

    /* 分类列表（固定首项"全部" + 后台配置的分类） */
    WallUI.getCategories = function () {
        var cats = (WallUI.data && WallUI.data.categories) || FALLBACK_CATEGORIES;
        return [{ key: "all", label: "全部" }].concat(cats);
    };

    /* 分类 key → 中文名 */
    WallUI.categoryLabel = function (key) {
        var cats = (WallUI.data && WallUI.data.categories) || FALLBACK_CATEGORIES;
        for (var i = 0; i < cats.length; i++) {
            if (cats[i].key === key) return cats[i].label;
        }
        return key;
    };

    WallUI.getWallpapers = function () {
        return (WallUI.data && WallUI.data.wallpapers) || [];
    };

    WallUI.findWallpaper = function (id) {
        var list = WallUI.getWallpapers();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(id)) return list[i];
        }
        return null;
    };

    /* 卡片缩略图：优先后台配置的真实图片，否则 picsum 占位 */
    WallUI.cardImage = function (item) {
        if (item.image) return item.image;
        return WallUI.imageUrl(item.seed || ("wp-" + item.id), 400, 711);
    };

    /* 详情页大图 */
    WallUI.heroImage = function (item) {
        if (item.image) return item.image;
        return WallUI.imageUrl(item.seed || ("wp-" + item.id), 720, 1280);
    };

    /* 下载地址：后台配置了对应设备的真实链接则优先，否则按尺寸生成占位图 */
    WallUI.downloadUrlFor = function (item, device, size) {
        var custom = item.downloads && item.downloads[device];
        if (custom) return custom;
        return WallUI.imageUrl(item.seed || ("wp-" + item.id), size.w, size.h);
    };

    /* 是否为可直接保存的图片链接（否则视为网页链接，直接新窗口打开） */
    WallUI.isDirectImage = function (url) {
        return /\.(jpe?g|png|webp|gif|bmp|avif)(\?|#|$)/i.test(String(url));
    };

    /* 壁纸详情页链接：后台已生成静态下载页则用静态页（SEO 友好），
       否则回退动态页 download.html?id= */
    WallUI.cardLink = function (item) {
        return item.page_url || ("download.html?id=" + encodeURIComponent(item.id));
    };

    /* ============================================================
       SEO：把后台配置应用到 <head>
       ============================================================ */
    function setMeta(name, content) {
        if (!content) return;
        var el = document.head.querySelector('meta[name="' + name + '"]');
        if (el) el.setAttribute("content", content);
    }

    function setOG(property, content) {
        if (!content) return;
        var el = document.head.querySelector('meta[property="' + property + '"]');
        if (el) el.setAttribute("content", content);
    }

    WallUI.applySEO = function (o) {
        o = o || {};
        if (o.title) document.title = o.title;
        setMeta("description", o.description);
        setMeta("keywords", o.keywords);
        setOG("og:title", o.title);
        setOG("og:description", o.description);
        setOG("og:image", o.image);
        setOG("og:url", o.url || location.href);
        /* canonical：动态页指向对应静态下载页，避免搜索引擎重复收录 */
        if (o.canonical) {
            var link = document.head.querySelector('link[rel="canonical"]');
            if (!link) {
                link = document.createElement("link");
                link.rel = "canonical";
                document.head.appendChild(link);
            }
            link.href = o.canonical;
        }
    };

    /* 首页 SEO */
    WallUI.applyHomeSEO = function () {
        var s = WallUI.site;
        WallUI.applySEO({
            title: s.home_title || s.site_name,
            description: s.home_description,
            keywords: s.home_keywords,
            image: s.site_url ? s.site_url.replace(/\/+$/, "") + "/assets/img/og-cover.png" : ""
        });
    };

    /* 下载页 SEO（模板变量 {title}；壁纸自带描述优先；已生成静态页时动态页 canonical 指向静态页） */
    WallUI.applyDownloadSEO = function (item) {
        var s = WallUI.site;
        var title = String(s.download_title_template || "{title} - 壁纸下载").replace(/\{title\}/g, item.title);
        var desc = item.description
            ? String(item.description)
            : String(s.download_description || "{title} 高清壁纸下载").replace(/\{title\}/g, item.title);
        WallUI.applySEO({
            title: title,
            description: desc,
            keywords: s.home_keywords,
            image: item.image || "",
            canonical: item.page_url ? location.origin + item.page_url : "",
            url: item.page_url ? location.origin + item.page_url : location.href
        });
    };

    /* ============================================================
       统计代码注入（后台"站点设置"里粘贴的完整代码）
       innerHTML 里的 <script> 不会执行，需手动重建节点
       ============================================================ */
    WallUI.mountAnalytics = function (code) {
        if (!code) return;
        var box = document.createElement("div");
        box.style.display = "none";
        box.innerHTML = code;
        var scripts = box.querySelectorAll("script");
        for (var i = 0; i < scripts.length; i++) {
            var old = scripts[i];
            var s = document.createElement("script");
            for (var j = 0; j < old.attributes.length; j++) {
                var a = old.attributes[j];
                s.setAttribute(a.name, a.value);
            }
            s.text = old.text;
            document.body.appendChild(s);
        }
    };

    /* ============================================================
       公共头部注入
       mode = "home"   ：logo(h1) + 搜索框 + 操作按钮 + 分类挂载点
       mode = "detail" ：返回键 + logo + 收藏/分享按钮
       ============================================================ */
    WallUI.renderHeader = function (mode) {
        var mount = document.getElementById("appHeader");
        if (!mount) return;

        var site = WallUI.site || FALLBACK_SITE;
        var emoji = WallUI.esc(site.logo_emoji || "📱");
        var name = String(site.site_name || "WallGallery");
        var mid = Math.ceil(name.length / 2);
        var brand = WallUI.esc(name.slice(0, mid)) + "<span>" + WallUI.esc(name.slice(mid)) + "</span>";

        if (mode === "detail") {
            mount.innerHTML =
                '<header class="app-header">' +
                    '<div class="header-inner page-bar">' +
                        '<button class="icon-btn header-back" id="backBtn" aria-label="返回">←</button>' +
                        '<a class="logo" href="./" aria-label="返回首页">' +
                            '<div class="logo-icon">' + emoji + '</div>' +
                            '<div class="logo-text">' + brand + '</div>' +
                        '</a>' +
                        '<div class="header-actions">' +
                            '<button class="icon-btn" id="detailFav" title="收藏">♡</button>' +
                            '<button class="icon-btn" id="detailShare" title="分享">↗</button>' +
                        '</div>' +
                    '</div>' +
                '</header>';
        } else {
            /* 顶部导航菜单：首页 + 全部分类（真实链接，分类走 ?cat= 参数；"全部"即首页不重复列） */
            var cats = WallUI.getCategories();
            var navLinks = '<a class="nav-link" href="./" data-cat="all">首页</a>';
            var panelLinks = '<a class="nav-panel-link" href="./">🏠 首页</a>';
            for (var i = 1; i < cats.length; i++) {
                var ck = WallUI.esc(cats[i].key);
                var cl = WallUI.esc(cats[i].label);
                navLinks += '<a class="nav-link" href="./?cat=' + ck + '" data-cat="' + ck + '">' + cl + '</a>';
                panelLinks += '<a class="nav-panel-link" href="./?cat=' + ck + '">' + cl + '</a>';
            }

            mount.innerHTML =
                '<header class="app-header">' +
                    '<div class="header-inner">' +
                        '<a class="logo" href="./">' +
                            '<div class="logo-icon">' + emoji + '</div>' +
                            '<h1 class="logo-text">' + brand + '</h1>' +
                        '</a>' +
                        '<nav class="header-nav" id="headerNav" aria-label="主导航">' + navLinks + '</nav>' +
                        '<div class="search-bar">' +
                            '<span class="search-icon">🔍</span>' +
                            '<input type="text" id="searchInput" placeholder="搜索壁纸、标签..." autocomplete="off">' +
                            '<button class="clear-btn" id="clearBtn" aria-label="清除">✕</button>' +
                        '</div>' +
                        '<div class="header-actions">' +
                            '<button class="icon-btn nav-toggle" id="navToggle" aria-label="导航菜单">☰</button>' +
                            '<button class="icon-btn" title="收藏">♡</button>' +
                            '<button class="icon-btn" title="更多">⋯</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="nav-panel" id="navPanel" hidden>' + panelLinks + '</div>' +
                    '<nav class="categories" id="categoryNav" aria-label="分类"></nav>' +
                '</header>';

            /* 移动端导航面板开合 */
            var navToggle = document.getElementById("navToggle");
            var navPanel = document.getElementById("navPanel");
            if (navToggle && navPanel) {
                navToggle.addEventListener("click", function (e) {
                    e.stopPropagation();
                    navPanel.hidden = !navPanel.hidden;
                    navToggle.textContent = navPanel.hidden ? "☰" : "✕";
                });
                document.addEventListener("click", function (e) {
                    if (!navPanel.hidden && !navPanel.contains(e.target)) {
                        navPanel.hidden = true;
                        navToggle.textContent = "☰";
                    }
                });
            }
        }
    };

    /* ============================================================
       公共页尾注入
       opts.bottomNav = true 时渲染移动端底部导航（首页用）
       页脚版权 / 备案号来自后台"站点设置"
       ============================================================ */
    WallUI.renderFooter = function (opts) {
        opts = opts || {};
        var site = WallUI.site || FALLBACK_SITE;
        var html = "";

        if (opts.bottomNav) {
            html +=
                '<nav class="bottom-nav">' +
                    '<button class="nav-item active"><span class="nav-icon">🏠</span><span>首页</span></button>' +
                    '<button class="nav-item"><span class="nav-icon">🔥</span><span>热门</span></button>' +
                    '<button class="nav-item"><span class="nav-icon">📂</span><span>分类</span></button>' +
                    '<button class="nav-item"><span class="nav-icon">👤</span><span>我的</span></button>' +
                '</nav>';
        }

        html += '<footer class="site-footer">';
        if (site.footer_text) html += '<p>' + WallUI.esc(site.footer_text) + '</p>';
        if (site.icp) {
            html += '<p><a href="https://beian.miit.gov.cn/" target="_blank" rel="nofollow noopener">' + WallUI.esc(site.icp) + '</a></p>';
        }
        html += '</footer>';

        var mount = document.getElementById("appFooter");
        if (mount) {
            mount.innerHTML = html;
        } else {
            document.body.insertAdjacentHTML("beforeend", html);
        }
    };

    /* ============================================================
       内置兜底壁纸数据（与仓库初始 wallpapers.json 保持一致）
       ============================================================ */
    var FALLBACK_WALLPAPERS = [
        { id: 1,  title: "梦幻星空",   category: "nature",   resolution: "1440×3200", seed: "wallpaper-01", image: "", downloads: {}, downloads_text: "12.4万" },
        { id: 2,  title: "暗夜都市",   category: "city",     resolution: "1080×2400", seed: "wallpaper-02", image: "", downloads: {}, downloads_text: "8.7万"  },
        { id: 3,  title: "极简线条",   category: "minimal",  resolution: "1440×3200", seed: "wallpaper-03", image: "", downloads: {}, downloads_text: "15.2万" },
        { id: 4,  title: "动漫少女",   category: "anime",    resolution: "1080×2340", seed: "wallpaper-04", image: "", downloads: {}, downloads_text: "23.1万" },
        { id: 5,  title: "森林晨雾",   category: "nature",   resolution: "1440×3200", seed: "wallpaper-05", image: "", downloads: {}, downloads_text: "6.9万"  },
        { id: 6,  title: "抽象流体",   category: "abstract", resolution: "1080×2400", seed: "wallpaper-06", image: "", downloads: {}, downloads_text: "4.3万"  },
        { id: 7,  title: "可爱猫咪",   category: "animal",   resolution: "1440×3200", seed: "wallpaper-07", image: "", downloads: {}, downloads_text: "19.8万" },
        { id: 8,  title: "暗黑纹理",   category: "dark",     resolution: "1080×2340", seed: "wallpaper-08", image: "", downloads: {}, downloads_text: "7.5万"  },
        { id: 9,  title: "赛博朋克",   category: "city",     resolution: "1440×3200", seed: "wallpaper-09", image: "", downloads: {}, downloads_text: "11.6万" },
        { id: 10, title: "水彩风景",   category: "nature",   resolution: "1080×2400", seed: "wallpaper-10", image: "", downloads: {}, downloads_text: "5.2万"  },
        { id: 11, title: "几何图案",   category: "minimal",  resolution: "1440×3200", seed: "wallpaper-11", image: "", downloads: {}, downloads_text: "9.1万"  },
        { id: 12, title: "二次元世界", category: "anime",    resolution: "1080×2340", seed: "wallpaper-12", image: "", downloads: {}, downloads_text: "26.7万" },
        { id: 13, title: "渐变迷雾",   category: "abstract", resolution: "1440×3200", seed: "wallpaper-13", image: "", downloads: {}, downloads_text: "3.8万"  },
        { id: 14, title: "狗狗日常",   category: "animal",   resolution: "1080×2400", seed: "wallpaper-14", image: "", downloads: {}, downloads_text: "14.5万" },
        { id: 15, title: "极简黑白",   category: "minimal",  resolution: "1440×3200", seed: "wallpaper-15", image: "", downloads: {}, downloads_text: "10.3万" },
        { id: 16, title: "深海世界",   category: "nature",   resolution: "1080×2340", seed: "wallpaper-16", image: "", downloads: {}, downloads_text: "7.9万"  },
        { id: 17, title: "霓虹夜色",   category: "dark",     resolution: "1440×3200", seed: "wallpaper-17", image: "", downloads: {}, downloads_text: "13.2万" },
        { id: 18, title: "油画质感",   category: "abstract", resolution: "1080×2400", seed: "wallpaper-18", image: "", downloads: {}, downloads_text: "4.6万"  }
    ];

})();
