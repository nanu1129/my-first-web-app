// Claude API 連携(ブラウザから直接呼び出し)。
// 公式 SDK を CDN(ESM)経由で利用する。dangerouslyAllowBrowser により
// ブラウザ直接アクセス用の CORS ヘッダーが自動付与される。
import Anthropic from "https://esm.sh/@anthropic-ai/sdk";
import { EQUIPMENT, GOALS, LEVELS } from "./planner.js";

const SYSTEM_PROMPT = `あなたは経験豊富なプロのパーソナルトレーナーです。
利用者のプロフィールに基づいて、1週間の筋トレメニューを日本語の Markdown で提案してください。

必ず守ること:
- 利用者が「使える」と申告した器具・施設だけを使う種目で構成すること。器具の申告がなければ自重種目のみにする。
- プールが使える場合は、目的に応じて水泳・水中ウォーキングを有酸素運動として積極的に組み込むこと。
- 各トレーニング日について「## Day N:(内容)」の見出しを付け、種目・セット数・回数・休憩時間を表で示すこと。
- 最後に「## 栄養・生活アドバイス」の見出しで、タンパク質摂取量の目安(体重から計算)、カロリー方針、注意点を箇条書きで示すこと。
- 安全に配慮し、レベルに合わない高難度種目は避けること。医学的な診断はしないこと。`;

function buildUserMessage(profile) {
  const equipmentText = profile.equipment.length > 0
    ? profile.equipment.map((k) => EQUIPMENT[k] ?? k).join("、")
    : "なし(自重トレーニングのみ可能)";
  return `以下のプロフィールに最適な1週間の筋トレメニューを作成してください。

- 体重: ${profile.weight}kg
- 身長: ${profile.height}cm
- 年齢: ${profile.age}歳
- 性別: ${profile.gender}
- 目的: ${GOALS[profile.goal] ?? profile.goal}
- 経験レベル: ${LEVELS[profile.level] ?? profile.level}
- 週のトレーニング頻度: ${profile.frequency}回
- 使える器具・施設: ${equipmentText}`;
}

// メニューを生成し、テキストの増分を onText コールバックで逐次通知する。
// 戻り値は完成したメッセージ全文。
export async function generateWithClaude(profile, apiKey, onText) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(profile) }],
  });

  stream.on("text", (delta) => onText(delta));

  const message = await stream.finalMessage();
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// SDK の型付き例外を利用者向けメッセージに変換する
export function describeApiError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "API キーが無効です。設定(⚙)から正しい API キーを入力してください。";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "リクエストが集中しています(レート制限)。しばらく待ってから再試行してください。";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Claude API に接続できませんでした。ネットワーク接続を確認してください。";
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude API エラーが発生しました(${error.status ?? "不明"}): ${error.message}`;
  }
  return `エラーが発生しました: ${error?.message ?? error}`;
}
