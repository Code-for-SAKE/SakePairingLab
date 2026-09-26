import {
  ArrowLeft,
  ClipboardPenLine,
  ExternalLink,
  Github,
  Search,
  Target,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const qrImage = new URL('../data/qr.png', import.meta.url).href;

const steps = [
  {
    icon: Search,
    number: '01',
    title: '日本酒を探す',
    description:
      '「フルーティで食事に合わせやすい」などの言葉で検索。気になる銘柄がなければ、新しい日本酒を登録できます。',
  },
  {
    icon: ClipboardPenLine,
    number: '02',
    title: '一杯の体験を記録する',
    description:
      '香りや味わい、飲んだ温度、酒器、合わせた料理を選び、評価やコメントと一緒にテイスティング記録を投稿します。',
  },
  {
    icon: Target,
    number: '03',
    title: 'クエストで試す',
    description:
      '温度や酒器、料理などのテーマに挑戦。みんなの記録を読み、次の飲み方やペアリングの発見につなげましょう。',
  },
];

export default function About() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <Link
            to="/"
            aria-label="アプリに戻る"
            className="mr-3 inline-flex h-9 w-9 items-center justify-center text-slate-500 hover:text-indigo-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="text-sm font-semibold">日本酒ペアリングラボ</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <section className="border-b border-slate-200 pb-10 sm:pb-12">
          <p className="mb-3 text-sm font-semibold tracking-wide text-indigo-700">
            ABOUT THE PROJECT
          </p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
            日本酒の「好き」を、
            <br className="hidden sm:block" />
            次の一杯の発見へ。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            日本酒ペアリングラボは、飲んだ感想や料理との組み合わせを記録し、みんなの体験から新しい楽しみ方を見つけるためのアプリです。
            日本酒ハッカソン2026のために、Code for SAKEが制作しました。
          </p>
        </section>

        <section className="py-10 sm:py-12" aria-labelledby="how-to-use">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500">GET STARTED</p>
              <h2 id="how-to-use" className="mt-1 text-2xl font-bold">
                使い方
              </h2>
            </div>
            <span className="pb-1 text-sm text-slate-500">3つのステップ</span>
          </div>
          <ol className="divide-y divide-slate-200 border-y border-slate-200">
            {steps.map(({ icon: Icon, number, title, description }) => (
              <li key={number} className="grid gap-3 py-5 sm:grid-cols-[3rem_1fr] sm:gap-5">
                <div className="flex items-center gap-3 sm:block">
                  <span className="text-xs font-semibold tabular-nums text-indigo-700">
                    {number}
                  </span>
                  <Icon className="h-5 w-5 text-indigo-700 sm:mt-3" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            記録の投稿やクエストへの参加にはログインが必要です。アプリ内の「探す」「ホーム」「クエスト」から始められます。
          </p>
        </section>

        <section className="grid gap-8 border-t border-slate-200 py-10 sm:grid-cols-[1fr_auto] sm:items-center sm:py-12">
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500">JOIN THE PROJECT</p>
            <h2 className="mt-1 text-2xl font-bold">一緒に育てませんか</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              機能のアイデアや不具合の報告を歓迎しています。GitHubでIssueを立てたり、改善にコントリビュートしたりして、このプロジェクトに参加してください。
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3">
              <a
                href="https://github.com/Code-for-SAKE/SakePairingLab"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
              >
                <Github className="h-4 w-4" />
                GitHubリポジトリ
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://github.com/Code-for-SAKE/SakePairingLab/issues/new/choose"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
              >
                Issueを投稿する
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href="https://www.code4sake.org/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
              >
                <Users className="h-4 w-4" />
                Code for SAKE
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
          <figure className="w-44 justify-self-center text-center sm:w-40">
            <img
              src={qrImage}
              alt="日本酒ペアリングラボのQRコード"
              className="aspect-square w-full bg-white object-contain"
            />
            <figcaption className="mt-2 text-xs text-slate-500">SakePairingLab</figcaption>
          </figure>
        </section>
      </div>
    </main>
  );
}
