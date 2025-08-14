// src/index.ts
import { BasicTool } from "zotero-plugin-toolkit";
import Addon from "./addon";
import { config } from "../package.json";

const basicTool = new BasicTool();

// 싱글톤 인스턴스 생성 & export
export const addon = new Addon();
export default addon;

// 전역 헬퍼
function defineGlobal(name: Parameters<BasicTool["getGlobal"]>[0]): void;
function defineGlobal(name: string, getter: () => any): void;
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name);
    },
  });
}

// 최초 1회만 글로벌 등록
// @ts-expect-error - Plugin instance is not typed
if (!basicTool.getGlobal("Zotero")[config.addonInstance]) {
  // 전역 접근 (디버깅/스크립트 콘솔에서 접근용)
  _globalThis.addon = addon;

  // ztoolkit 전역 게터
  defineGlobal("ztoolkit", () => addon.data.ztoolkit);

  // Zotero 네임스페이스에 인스턴스 노출
  // @ts-expect-error - Plugin instance is not typed
  Zotero[config.addonInstance] = addon;
}
