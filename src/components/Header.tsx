/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FlaskRound } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="flex items-center justify-center h-14 px-4">
        <FlaskRound className="w-5 h-5 text-indigo-600 mr-2" />
        <h1 className="text-lg font-bold text-slate-900 tracking-tight">
          日本酒ペアリングラボ
        </h1>
      </div>
    </header>
  );
}

