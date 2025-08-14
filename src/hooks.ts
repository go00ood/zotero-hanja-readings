// src/hooks.ts
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import addon from "./index";
import hanjaMap from "./data/hanjaMap";

let selectionHandler: ((ev: any) => void) | null = null;

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // 각 창마다 ztoolkit 생성
  addon.data.ztoolkit = createZToolkit();

  // (선택) strings용 FTL 로드
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // PDF 리더: 드래그 후 마우스 업 → 선택 팝업 렌더 시점
  selectionHandler = (event: any) => {
    try {
      const { reader, params } = event;
      const rawText: string = params?.annotation?.text ?? "";
      if (!rawText) return;

      // 한자 주석(괄호) 부착
      const annotated = annotateHanjaPlain(rawText, hanjaMap, {
        open: "(", close: ")", sep: "",
      });

      showSelectionToast(reader, annotated);
    } catch (e) {
      Zotero.debug(`selectionHandler error: ${e}`);
    }
  };

  Zotero.Reader.registerEventListener(
    "renderTextSelectionPopup",
    selectionHandler,
    (addon.data.config as any).addonID ?? addon.data.config.addonRef,
  );
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  if (selectionHandler) {
    try {
      Zotero.Reader.unregisterEventListener(
        "renderTextSelectionPopup",
        selectionHandler,
      );
    } catch { }
    selectionHandler = null;
  }
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  if (selectionHandler) {
    try {
      Zotero.Reader.unregisterEventListener(
        "renderTextSelectionPopup",
        selectionHandler,
      );
    } catch { }
    selectionHandler = null;
  }
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

// ============================
// Helpers
// ============================

/** 한자 주석: 연속된 한자 블록 뒤에 (읽음) 붙이기 */
function annotateHanjaPlain(
  text: string,
  map: Record<string, string>,
  opts: { open?: string; close?: string; sep?: string; allRequired?: boolean } = {},
) {
  const { open = "(", close = ")", sep = "", allRequired = false } = opts;
  const HAN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/g; // 확장A, 기본, 호환
  return text.replace(HAN_RE, (hanjas) => {
    const readings = [...hanjas].map((ch) => map[ch] || "");
    if (allRequired ? readings.every((r) => r) : readings.some((r) => r)) {
      const joined = readings.join(sep);
      return `${hanjas}${open}${joined}${close}`;
    }
    return hanjas;
  });
}

/** PDF 리더 iframe 오른쪽 하단 토스트 */
function showSelectionToast(reader: any, annotatedText: string) {
  const win: Window | undefined = reader?._iframeWindow;
  if (!win) return;
  const doc = win.document as Document;

  const root = (doc.body ?? doc.documentElement) as HTMLElement;

  // 기존 토스트 제거(중복 방지)
  const oldHost = doc.getElementById("hra-toast-host");
  if (oldHost) oldHost.remove();

  // 호스트
  const host = doc.createElement("div") as HTMLElement;
  host.id = "hra-toast-host";
  host.style.position = "fixed";
  host.style.right = "24px";
  host.style.bottom = "24px";
  host.style.zIndex = "2147483647";
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.gap = "10px";
  host.style.pointerEvents = "none"; // 토스트만 이벤트 받게
  root.appendChild(host);

  // 토스트
  const toast = doc.createElement("div") as HTMLDivElement;
  toast.style.pointerEvents = "auto";
  toast.style.maxWidth = "640px";
  toast.style.background = "rgba(28,28,30,0.96)";
  toast.style.color = "#fff";
  toast.style.backdropFilter = "blur(4px)";
  toast.style.padding = "12px 14px";
  toast.style.borderRadius = "12px";
  toast.style.boxShadow = "0 8px 24px rgba(0,0,0,.35)";
  toast.style.display = "flex";
  toast.style.gap = "12px";
  toast.style.alignItems = "flex-start";
  toast.style.fontSize = "13px";
  toast.style.position = "relative"; // 배지용

  // 내용(클릭 시 복사)
  const content = doc.createElement("div") as HTMLDivElement;
  content.style.userSelect = "text";
  content.style.whiteSpace = "pre-wrap";
  content.style.maxHeight = "160px";
  content.style.overflow = "auto";
  content.style.outline = "none";
  content.title = "클릭하면 복사됩니다";
  content.textContent = annotatedText;
  content.onclick = async () => {
    const ok = await copyToClipboard(win, doc, root, annotatedText);
    if (ok) flashBadge(doc, toast, "복사됨");
  };

  // 버튼들
  const actions = doc.createElement("div") as HTMLDivElement;
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.marginLeft = "auto";

  const makeBtn = (label: string) => {
    const b = doc.createElement("button") as HTMLButtonElement;
    b.textContent = label;
    b.style.fontSize = "12px";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "8px";
    b.style.border = "none";
    b.style.background = "#3a3a3c";
    b.style.color = "#fff";
    b.style.cursor = "pointer";
    b.onmouseenter = () => (b.style.background = "#4a4a4d");
    b.onmouseleave = () => (b.style.background = "#3a3a3c");
    return b;
  };

  const copyBtn = makeBtn("복사");
  copyBtn.onclick = async () => {
    const ok = await copyToClipboard(win, doc, root, annotatedText);
    if (ok) flashBadge(doc, toast, "복사됨");
  };

  const closeBtn = makeBtn("닫기");
  closeBtn.onclick = () => cleanup();

  actions.append(copyBtn, closeBtn);
  toast.append(content, actions);
  host.appendChild(toast);

  // 선택 해제되면 자동 닫힘
  const onSelectionChange = () => {
    const sel = doc.defaultView?.getSelection?.();
    const gone = !sel || sel.isCollapsed || sel.toString().trim() === "";
    if (gone) cleanup();
  };
  doc.addEventListener("selectionchange", onSelectionChange, true);

  function cleanup() {
    doc.removeEventListener("selectionchange", onSelectionChange, true);
    host.remove();
  }
}

/** 복사 피드백 배지(절대배치: 레이아웃 영향 없음) */
function flashBadge(doc: Document, container: HTMLElement, msg: string) {
  const badge = doc.createElement("span") as HTMLSpanElement;
  badge.textContent = msg;
  badge.style.position = "absolute";
  badge.style.right = "10px";
  badge.style.bottom = "8px";
  badge.style.background = "rgba(60,60,62,.9)";
  badge.style.padding = "2px 8px";
  badge.style.borderRadius = "9999px";
  badge.style.fontSize = "11px";
  badge.style.opacity = "0";
  badge.style.transition = "opacity .15s ease";
  badge.style.pointerEvents = "none";
  container.appendChild(badge);
  const raf = doc.defaultView?.requestAnimationFrame;
  if (raf) raf(() => (badge.style.opacity = "1"));
  else setTimeout(() => (badge.style.opacity = "1"), 0);
  setTimeout(() => {
    badge.style.opacity = "0";
    setTimeout(() => badge.remove(), 150);
  }, 700);
}

// Clipboard API → execCommand 폴백
async function copyToClipboard(
  win: Window,
  doc: Document,
  root: HTMLElement,
  text: string,
) {
  try {
    const ok = await (win.navigator as any).clipboard?.writeText?.(text);
    return ok === undefined ? true : !!ok;
  } catch {
    try {
      const ta = doc.createElement("textarea") as HTMLTextAreaElement;
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      root.appendChild(ta);
      ta.select();
      const ok = doc.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
};
