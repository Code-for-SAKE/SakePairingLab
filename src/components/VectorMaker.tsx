import { useEffect, useRef, useState } from 'react';
import { generateQueryEmbedding } from '../lib/gemini';
import { AccordionItem } from './AccordionItem';
import { TextVector } from '../dummyTypes';

interface VectorMakerProps {
  onDataChange?: (data: TextVector[]) => void; // string型の引数を受け取り、戻り値はない関数
}

export default function VectorMaker({ onDataChange }: VectorMakerProps) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [vectors, setVectors] = useState<TextVector[]>([]);
  const [jsonData, setJsonData] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: any) => {
    const file = event.target.files[0];

    // ファイルが選択されていない場合は何もしない
    if (!file) return;

    // 1. FileReaderのインスタンスを作成
    const reader = new FileReader();

    // 2. 読み込み完了時の処理を定義
    reader.onload = (e: any) => {
      try {
        // e.target.result にファイルの中身（文字列）が入る
        const jsonString = e.target.result;

        // JSON文字列をJavaScriptのオブジェクトに変換
        const parsedData = JSON.parse(jsonString);

        // 状態（State）に保存
        setJsonData(parsedData);

        setVectors(parsedData);
        setError(''); // エラーをクリア
      } catch (err) {
        setError('無効なJSONファイルです。正しいJSONを選択してください。');
        setJsonData(null);
      }
    };

    // 3. 読み込み失敗時の処理を定義
    reader.onerror = () => {
      setError('ファイルの読み込みに失敗しました。');
    };

    // 4. テキストとしてファイルの読み込みを開始
    reader.readAsText(file);
  };

  const search = async (query: string) => {
    console.log('vector query', query);
    const vec = await generateQueryEmbedding(query, 1024);
    setVectors((prev) => [...prev, { name: name, text: query, vector: vec }]);
  };
  useEffect(() => {
    if (onDataChange) onDataChange(vectors);
  }, [vectors]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    await search(trimmed);
  };

  const handleSave = async () => {
    if (!vectors) {
      return;
    }
    // 1. データをJSON文字列に変換
    const jsonString = JSON.stringify(vectors, null);

    // 2. Blobを作成（MIMEタイプをapplication/jsonに設定）
    const blob = new Blob([jsonString], { type: 'application/json' });

    // 3. オブジェクトURLを生成
    const url = URL.createObjectURL(blob);

    // 4. 一時的な<a>タグを作成して自動クリック
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data.json'; // 保存するファイル名
    document.body.appendChild(link);
    link.click();

    // 5. 後片付け（要素とURLの解放）
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto pt-6 px-4 pb-8">
      <div>
        {/* accept=".json" でJSONファイルのみを選択しやすくします */}
        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`w-full rounded-lg border-none p-3 text-sm font-bold text-white cursor-pointer bg-indigo-400 hover:bg-indigo-500`}
        >
          ベクトルファイル読み込み
        </button>
      </div>
      <div>
        {/* エラーメッセージの表示 */}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
      <AccordionItem title="ベクトル生成">
        <input
          type="text"
          className="block w-full pl-10 pr-24 py-3 mb-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="block w-full pl-10 pr-24 py-3 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-shadow shadow-sm"
          placeholder="特徴"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="w-full bg-indigo-600 text-white py-4 my-4 rounded-xl font-medium disabled:opacity-50 flex justify-center items-center shadow-md hover:bg-indigo-700 transition-colors"
          onClick={handleSearch}
        >
          作成
        </button>
        <button
          className="w-full bg-indigo-600 text-white py-4 my-4 rounded-xl font-medium disabled:opacity-50 flex justify-center items-center shadow-md hover:bg-indigo-700 transition-colors"
          onClick={handleSave}
        >
          保存
        </button>
      </AccordionItem>
      <AccordionItem title={`ベクトル詳細 ${vectors.length}件`}>
        <div>
          {vectors.map((vec, index) => (
            <div
              key={`vector-${index}`}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"
            >
              <p>{vec.name}</p>
              <p>{vec.text}</p>
              <p>{vec.vector.slice(0, 5).join(', ')}...</p>
            </div>
          ))}
        </div>
      </AccordionItem>
    </div>
  );
}
