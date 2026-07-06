import { openDB } from "idb";

// IndexedDB 永続化。単一ドキュメント運用(複数ドキュメント対応は必要になったら)。
const dbp = openDB("art", 1, {
  upgrade(db) { db.createObjectStore("docs"); },
});

export async function saveDoc(json: string) {
  (await dbp).put("docs", json, "current");
}

export async function loadDoc(): Promise<string | undefined> {
  return (await dbp).get("docs", "current");
}
