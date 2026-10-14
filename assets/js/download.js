/* ============================================================
   download.js — 下载详情页逻辑（download.html?id=x）
   依赖 common.js（WallUI）
   每张壁纸一个独立 URL，相关推荐为真实页面跳转（利于 SEO）
   ============================================================ */
(function () {
    "use strict";

    /* ============================================================
       状态
       ============================================================ */
    var currentWallpaper = null;
    var currentDevice = "phone";
    var currentSize = null;
    var isDownloading = false;
    var faved = false;

    /* DOM 引用（头部由 renderHeader 注入后获取） */
    var detailImage, detailTitle, detailTags, statSize, statDownloads;
    var deviceTabs, sizeOptions, downloadBtn, dlProgress, dlIcon, dlText;
    var relatedScroll;
    var mockupEl = null;   /* 预览区设备边框（手机/平板/显示器共用容器） */

    /* 尺寸规格表：后台 site.json 的 sizes，加载失败时用内置默认 */
    var DEFAULT_SIZES = {
        phone: [
            { label: "1080 × 1920", w: 1080, h: 1920, tag: "FHD" },
            { label: "1080 × 2400", w: 1080, h: 2400, tag: "全面屏" },
            { label: "1284 × 2778", w: 1284, h: 2778, tag: "iPhone" },
            { label: "1440 × 3200", w: 1440, h: 3200, tag: "2K 超清" }
        ],
        tablet: [
            { label: "1536 × 2048", w: 1536, h: 2048, tag: "标准" },
            { label: "1668 × 2388", w: 1668, h: 2388, tag: "iPad Pro" },
            { label: "2048 × 2732", w: 2048, h: 2732, tag: "2K 超清" }
        ],
        desktop: [
            { label: "1920 × 1080", w: 1920, h: 1080, tag: "FHD" },
            { label: "2560 × 1440", w: 2560, h: 1440, tag: "2K" },
            { label: "3840 × 2160", w: 3840, h: 2160, tag: "4K" }
        ]
    };

    function getSizes() {
        return (WallUI.site && WallUI.site.sizes) || DEFAULT_SIZES;
    }

    /* ============================================================
       空状态：壁纸不存在 / 已下架 / 未传 id
       ============================================================ */
    function renderEmpty() {
        document.getElementById("detailMain").innerHTML =
            '<div class="detail-empty">' +
                '<div class="empty-icon">🌌</div>' +
                '<p>壁纸不存在或已下架</p>' +
                '<a class="back-home-btn" href="/">返回首页</a>' +
            '</div>';
    }

    /* ============================================================
       手机状态栏时钟（实机演示效果）
       ============================================================ */
    function startPhoneClock() {
        var el = document.getElementById("phoneTime");
        if (!el) return;
        function tick() {
            var d = new Date();
            el.textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
        }
        tick();
        setInterval(tick, 15000);
    }

    /* ============================================================
       渲染：详情
       ============================================================ */
    function renderDetail(item) {
        var bigUrl = WallUI.heroImage(item);
        var catLabel = WallUI.categoryLabel(item.category);

        detailImage.src = bigUrl;
        detailImage.alt = item.title;
        detailImage.onerror = function () {
            this.onerror = null;
            this.src = WallUI.imageUrl("fb" + item.id, 720, 1280);
        };
        detailTitle.textContent = item.title;

        detailTags.innerHTML =
            '<span class="tag accent">' + WallUI.esc(catLabel) + '</span>' +
            '<span class="tag">' + WallUI.esc(item.resolution || "") + '</span>' +
            '<span class="tag">高清壁纸</span>';

        statDownloads.textContent = item.downloads_text || "—";

        /* 壁纸描述（后台可配，无则隐藏） */
        var detailDesc = document.getElementById("detailDesc");
        if (item.description) {
            detailDesc.textContent = item.description;
            detailDesc.hidden = false;
        } else {
            detailDesc.textContent = "";
            detailDesc.hidden = true;
        }

        /* 重置设备选择 */
        currentDevice = "phone";
        deviceTabs.querySelectorAll(".device-tab").forEach(function (t, i) {
            t.classList.toggle("active", i === 0);
        });
        setDeviceVisual(currentDevice);
        renderSizeOptions();

        /* 相关推荐：优先同分类，不足 5 个补其他，链接指向静态页（无则动态页） */
        var all = WallUI.getWallpapers();
        var related = all.filter(function (w) {
            return w.category === item.category && w.id !== item.id;
        });
        if (related.length < 5) {
            all.forEach(function (w) {
                if (w.id !== item.id && related.indexOf(w) === -1) related.push(w);
            });
        }

        relatedScroll.innerHTML = related.slice(0, 10).map(function (w) {
            return (
                '<a class="related-card" href="' + WallUI.esc(WallUI.cardLink(w)) + '">' +
                    '<div class="thumb">' +
                        '<img src="' + WallUI.esc(WallUI.cardImage(w, 256, 455)) + '" alt="' + WallUI.esc(w.title) + '" loading="lazy">' +
                    '</div>' +
                    '<div class="r-title">' + WallUI.esc(w.title) + '</div>' +
                    '<div class="r-meta">' + WallUI.esc(w.resolution || "") + '</div>' +
                '</a>'
            );
        }).join("");
    }

    /* ============================================================
       设备 / 尺寸选择
       ============================================================ */
    /* 预览区联动：切换设备 Tab 时，边框在 手机 / 平板 / 显示器 间切换 */
    function setDeviceVisual(device) {
        if (!mockupEl) return;
        mockupEl.classList.toggle("as-tablet", device === "tablet");
        mockupEl.classList.toggle("as-desktop", device === "desktop");
        /* 重播入场小弹跳，强化"换了台设备"的感觉 */
        mockupEl.classList.remove("pop");
        void mockupEl.offsetWidth;
        mockupEl.classList.add("pop");
    }

    /* 预览区宽高比跟随所选尺寸的实机分辨率（如 1920×1080 → 16:9、1440×3200 → 9:20） */
    function setMockupRatio() {
        if (!mockupEl || !currentSize) return;
        mockupEl.style.aspectRatio = currentSize.w + " / " + currentSize.h;
    }

    /* 设备 Tab 按后台开关渲染：手机固定显示，平板 / 桌面默认关闭（不显示 Tab） */
    function renderDeviceTabs() {
        if (!deviceTabs) return;
        var s = WallUI.site || {};
        var html = '<button class="device-tab active" data-device="phone">📱 手机</button>';
        if (String(s.enable_tablet) === "1") {
            html += '<button class="device-tab" data-device="tablet">💻 平板</button>';
        }
        if (String(s.enable_desktop) === "1") {
            html += '<button class="device-tab" data-device="desktop">🖥️ 桌面</button>';
        }
        deviceTabs.innerHTML = html;
    }

    function renderSizeOptions() {
        var list = getSizes()[currentDevice];
        currentSize = list[0];

        sizeOptions.innerHTML = list.map(function (s, i) {
            var active = i === 0 ? " active" : "";
            return (
                '<button class="size-option' + active + '" data-index="' + i + '">' +
                    '<span class="size-label">' + WallUI.esc(s.label) + '</span>' +
                    '<span class="size-tag">' + WallUI.esc(s.tag) + '</span>' +
                '</button>'
            );
        }).join("");

        statSize.textContent = list[0].label.replace(/\s/g, "");
        setMockupRatio();
    }

    /* ============================================================
       下载逻辑
       ============================================================ */
    function resetDownloadBtn() {
        isDownloading = false;
        downloadBtn.classList.remove("downloading", "done");
        dlProgress.style.width = "0%";
        dlIcon.textContent = "⬇";
        dlText.textContent = "下载壁纸";
    }

    function finishDownload() {
        dlProgress.style.width = "100%";
        dlText.textContent = "下载完成";
        dlIcon.textContent = "✓";
        downloadBtn.classList.remove("downloading");
        downloadBtn.classList.add("done");
        WallUI.toast("壁纸已保存到本地 ✓");

        setTimeout(function () {
            resetDownloadBtn();
        }, 3000);
    }

    function onDownloadClick() {
        if (isDownloading || !currentWallpaper || !currentSize) return;

        var item = currentWallpaper;
        var device = currentDevice;
        var size = currentSize;
        var url = WallUI.downloadUrlFor(item, device, size);

        /* 后台配置的是网页链接（如网盘分享页）→ 直接新窗口打开 */
        if (item.downloads && item.downloads[device] && !WallUI.isDirectImage(url)) {
            window.open(url, "_blank", "noopener");
            WallUI.toast("已打开下载页面");
            return;
        }

        isDownloading = true;
        downloadBtn.classList.add("downloading");
        dlIcon.textContent = "⏳";
        dlText.textContent = "正在下载 0%";

        var progress = 0;
        var tick = setInterval(function () {
            progress = Math.min(progress + Math.random() * 16, 90);
            dlProgress.style.width = progress + "%";
            dlText.textContent = "正在下载 " + Math.floor(progress) + "%";
        }, 130);

        var finish = function () { clearInterval(tick); finishDownload(); };

        fetch(url, { mode: "cors" }).then(function (res) {
            if (!res.ok) throw new Error("network");
            return res.blob();
        }).then(function (blob) {
            var blobUrl = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = blobUrl;
            a.download = item.title + "_" + size.w + "x" + size.h + ".jpg";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 3000);
            finish();
        }).catch(function () {
            /* fetch 失败（跨域限制等）→ 兜底新窗口打开原图 */
            window.open(url, "_blank", "noopener");
            finish();
        });
    }

    /* ============================================================
       收藏 / 分享 / 返回
       ============================================================ */
    function bindHeaderActions() {
        var backBtn = document.getElementById("backBtn");
        var detailFav = document.getElementById("detailFav");
        var detailShare = document.getElementById("detailShare");

        /* 返回：有来路就回退，否则回首页（根绝对路径，静态子目录下同样正确） */
        backBtn.addEventListener("click", function () {
            if (history.length > 1 && document.referrer) {
                history.back();
            } else {
                location.href = "/";
            }
        });

        detailFav.addEventListener("click", function () {
            faved = !faved;
            detailFav.textContent = faved ? "♥" : "♡";
            detailFav.style.color = faved ? "#ff6b81" : "";
            WallUI.toast(faved ? "已加入收藏" : "已取消收藏");
        });

        detailShare.addEventListener("click", function () {
            var shareData = {
                title: currentWallpaper ? currentWallpaper.title : "手机壁纸",
                text: "发现一张超好看的壁纸，分享给你！",
                url: location.href
            };
            if (navigator.share) {
                navigator.share(shareData).catch(function () { /* 用户取消 */ });
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(location.href).then(function () {
                    WallUI.toast("链接已复制到剪贴板");
                });
            } else {
                WallUI.toast("当前环境不支持分享");
            }
        });
    }

    /* ============================================================
       初始化
       ============================================================ */
    WallUI.loadData().then(function () {
        WallUI.renderHeader("detail");
        WallUI.renderFooter({});
        WallUI.mountAnalytics(WallUI.site.analytics);

        startPhoneClock();
        bindHeaderActions();

        detailImage    = document.getElementById("detailImage");
        detailTitle    = document.getElementById("detailTitle");
        detailTags     = document.getElementById("detailTags");
        statSize       = document.getElementById("statSize");
        statDownloads  = document.getElementById("statDownloads");
        deviceTabs     = document.getElementById("deviceTabs");
        sizeOptions    = document.getElementById("sizeOptions");
        downloadBtn    = document.getElementById("downloadBtn");
        dlProgress     = document.getElementById("dlProgress");
        dlIcon         = document.getElementById("dlIcon");
        dlText         = document.getElementById("dlText");
        relatedScroll  = document.getElementById("relatedScroll");
        mockupEl       = document.querySelector(".phone-mockup");

        /* 按后台开关渲染设备 Tab（关闭的平台不显示） */
        renderDeviceTabs();

        /* 定位壁纸：静态下载页（builder.php 生成）内嵌 __PAGE_WALLPAPER__ 优先；
           动态页按 URL 参数查询 */
        var item = window.__PAGE_WALLPAPER__ || WallUI.findWallpaper(WallUI.qs("id"));
        if (!item) {
            renderEmpty();
            return;
        }

        currentWallpaper = item;
        WallUI.applyDownloadSEO(item);
        renderDetail(item);

        /* 尺寸选择（预览区比例同步切换） */
        sizeOptions.addEventListener("click", function (e) {
            var opt = e.target.closest(".size-option");
            if (!opt || isDownloading) return;
            sizeOptions.querySelectorAll(".size-option").forEach(function (o) {
                o.classList.remove("active");
            });
            opt.classList.add("active");
            currentSize = getSizes()[currentDevice][Number(opt.dataset.index)];
            statSize.textContent = currentSize.label.replace(/\s/g, "");
            setMockupRatio();
        });

        /* 设备切换（下载规格 + 预览区实机演示联动） */
        deviceTabs.addEventListener("click", function (e) {
            var tab = e.target.closest(".device-tab");
            if (!tab || isDownloading) return;
            deviceTabs.querySelectorAll(".device-tab").forEach(function (t) {
                t.classList.remove("active");
            });
            tab.classList.add("active");
            currentDevice = tab.dataset.device;
            setDeviceVisual(currentDevice);
            renderSizeOptions();
        });

        downloadBtn.addEventListener("click", onDownloadClick);
    });
})();
