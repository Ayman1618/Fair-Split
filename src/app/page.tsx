'use client';

import React, { useState } from 'react';
import {
  Upload,
  Receipt,
  Users,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowRight,
  Sparkles,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { ApiSplitResponse } from '@/types';
import { calculateBillSplit } from '@/lib/calcEngine';

// Sample Fixtures for quick demo testing
const FIXTURES = [
  {
    id: 'R1',
    label: 'R1: 3 People (Ravi, Neha, Sameer)',
    receipt: {
      items: [
        { name: 'Cappuccino', quantity: 1, line_total: 180 },
        { name: 'Grilled Chicken Sandwich', quantity: 1, line_total: 260 },
        { name: 'Penne Arrabiata', quantity: 1, line_total: 320 },
        { name: 'Fresh Lime Soda', quantity: 1, line_total: 120 },
        { name: 'Brownie', quantity: 1, line_total: 160 },
      ],
      subtotal: 1040,
      service_charge: 52,
      tax: 54.6,
      discount: 0,
      round_off: 0.4,
      grand_total: 1147,
    },
    description:
      'Three of us: Ravi, Neha, Sameer. Ravi had the cappuccino and sandwich. Neha had pasta and lime soda. Sameer had the brownie. Sameer paid.',
    descData: {
      people: ['Ravi', 'Neha', 'Sameer'],
      payer: 'Sameer',
      item_allocations: [
        { item_name: 'Cappuccino', consumers: ['Ravi'] },
        { item_name: 'Grilled Chicken Sandwich', consumers: ['Ravi'] },
        { item_name: 'Penne Arrabiata', consumers: ['Neha'] },
        { item_name: 'Fresh Lime Soda', consumers: ['Neha'] },
        { item_name: 'Brownie', consumers: ['Sameer'] },
      ],
      default_consumers: ['Ravi', 'Neha', 'Sameer'],
      assumptions: [],
    },
  },
  {
    id: 'R2',
    label: 'R2: 4 People (Aman, Priya, Karan, Sara)',
    receipt: {
      items: [
        { name: 'Paneer Butter Masala', quantity: 1, line_total: 320 },
        { name: 'Dal Makhani', quantity: 1, line_total: 260 },
        { name: 'Butter Naan', quantity: 4, line_total: 240 },
        { name: 'Jeera Rice', quantity: 1, line_total: 180 },
        { name: 'Gulab Jamun', quantity: 2, line_total: 120 },
        { name: 'Masala Papad', quantity: 2, line_total: 100 },
      ],
      subtotal: 1220,
      service_charge: 61,
      tax: 64.05,
      discount: 0,
      round_off: -0.05,
      grand_total: 1345,
    },
    description:
      'Four of us: Aman, Priya, Karan, Sara. The Gulab Jamun was shared just by Priya and Karan. Everything else was common to all four. Priya paid.',
    descData: {
      people: ['Aman', 'Priya', 'Karan', 'Sara'],
      payer: 'Priya',
      item_allocations: [
        { item_name: 'Gulab Jamun', consumers: ['Priya', 'Karan'] },
      ],
      default_consumers: ['Aman', 'Priya', 'Karan', 'Sara'],
      assumptions: [],
    },
  },
  {
    id: 'R3',
    label: 'R3: 3 People (Ishaan, Meera, Rohit)',
    receipt: {
      items: [
        { name: 'Margherita Pizza', quantity: 1, line_total: 380 },
        { name: 'Arrabiata Pasta', quantity: 1, line_total: 340 },
        { name: 'Garlic Bread', quantity: 1, line_total: 160 },
        { name: 'Craft Beer', quantity: 2, line_total: 500 },
        { name: 'Virgin Mojito', quantity: 1, line_total: 180 },
      ],
      subtotal: 1560,
      service_charge: 78,
      tax: 81.9,
      discount: 0,
      round_off: 0.1,
      grand_total: 1720,
    },
    description:
      'Ishaan, Meera, Rohit. Pizza, pasta, garlic bread shared by all. Two beers consumed by Ishaan and Rohit only. Mojito by Meera. Rohit paid.',
    descData: {
      people: ['Ishaan', 'Meera', 'Rohit'],
      payer: 'Rohit',
      item_allocations: [
        { item_name: 'Craft Beer', consumers: ['Ishaan', 'Rohit'] },
        { item_name: 'Virgin Mojito', consumers: ['Meera'] },
      ],
      default_consumers: ['Ishaan', 'Meera', 'Rohit'],
      assumptions: [],
    },
  },
  {
    id: 'R4',
    label: 'R4: 4 People (Dev, Nikhil, Anjali, Farah - Discount)',
    receipt: {
      items: [
        { name: 'Chicken Biryani', quantity: 2, line_total: 560 },
        { name: 'Veg Biryani', quantity: 1, line_total: 240 },
        { name: 'Mutton Rogan Josh', quantity: 1, line_total: 420 },
        { name: 'Raita', quantity: 2, line_total: 120 },
        { name: 'Soft Drinks', quantity: 3, line_total: 180 },
      ],
      subtotal: 1520,
      discount: 228,
      service_charge: 76,
      tax: 68.4,
      round_off: -0.4,
      grand_total: 1436,
    },
    description:
      'Dev, Nikhil, Anjali, Farah. Dev and Nikhil each consumed one chicken biryani. Anjali consumed veg biryani. Farah consumed rogan josh. Raita and soft drinks shared by all four. Anjali paid.',
    descData: {
      people: ['Dev', 'Nikhil', 'Anjali', 'Farah'],
      payer: 'Anjali',
      item_allocations: [
        { item_name: 'Chicken Biryani', consumers: ['Dev', 'Nikhil'] },
        { item_name: 'Veg Biryani', consumers: ['Anjali'] },
        { item_name: 'Mutton Rogan Josh', consumers: ['Farah'] },
      ],
      default_consumers: ['Dev', 'Nikhil', 'Anjali', 'Farah'],
      assumptions: [],
    },
  },
];

export default function HomePage() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ApiSplitResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      const pureBase64 = dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      setBase64Image(pureBase64);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  };

  const handlePresetSelect = (fixture: typeof FIXTURES[0]) => {
    setDescription(fixture.description);
    // Instant client-side computation for preset testing
    const computed = calculateBillSplit(fixture.receipt, fixture.descData);
    setResult(computed);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!description.trim()) {
      setErrorMsg('Please enter a plain-English consumption description.');
      return;
    }

    if (!base64Image) {
      setErrorMsg('Please upload a receipt image or select a preset bill.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_base64: base64Image,
          description: description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to split bill');
      }

      setResult(data);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation / Brand Banner */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Fair Split
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                  Deterministic Math Engine
                </span>
              </h1>
            </div>
          </div>
          <div className="text-xs text-slate-400 hidden sm:block">
            AI interprets receipts & descriptions • Application code calculates money
          </div>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Preset Selector Banner */}
        <div className="mb-8 p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                Test Fixture Presets (R1 – R4)
              </h2>
              <p className="text-xs text-slate-400">
                Click any preset to test the deterministic calculation engine instantly:
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {FIXTURES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handlePresetSelect(f)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                {f.id}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Form & Inputs */}
          <div className="lg:col-span-5 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Receipt Upload Box */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                <label className="block text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  1. Receipt Image
                </label>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 bg-slate-950/40 rounded-xl p-6 text-center cursor-pointer transition-colors"
                >
                  {imagePreview ? (
                    <div className="space-y-3">
                      <img
                        src={imagePreview}
                        alt="Receipt preview"
                        className="max-h-56 mx-auto rounded-lg object-contain border border-slate-800 shadow-md"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview(null);
                          setBase64Image('');
                        }}
                        className="text-xs text-rose-400 hover:underline"
                      >
                        Remove image
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer space-y-2 block">
                      <Upload className="w-8 h-8 mx-auto text-slate-400" />
                      <span className="text-sm text-slate-300 font-medium block">
                        Drag & drop receipt image or click to upload
                      </span>
                      <span className="text-xs text-slate-500 block">
                        Supports PNG, JPG, WEBP
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleImageUpload(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Description Input Textarea */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
                <label className="block text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400" />
                  2. Consumption & Payer Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="e.g. Four of us: Aman, Priya, Karan, Sara. The Gulab Jamun was shared just by Priya and Karan. Everything else was common to all four. Priya paid."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
                />
              </div>

              {errorMsg && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>{errorMsg}</div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-emerald-900/30 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Extracting & Calculating Split...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Split Bill Now
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Output / Dashboard */}
          <div className="lg:col-span-7 space-y-6">
            {!result ? (
              <div className="h-full min-h-[400px] border border-dashed border-slate-800 rounded-2xl bg-slate-900/20 p-8 flex flex-col items-center justify-center text-center">
                <Receipt className="w-12 h-12 text-slate-600 mb-3" />
                <h3 className="text-base font-semibold text-slate-300">
                  Ready to Split
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">
                  Upload a receipt image and enter a description, or select one of the
                  test fixture presets above to calculate a split.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs text-slate-400 block font-medium">
                      Grand Total
                    </span>
                    <span className="text-xl font-bold text-white mt-1 block">
                      ₹{result.grand_total}
                    </span>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs text-slate-400 block font-medium">
                      Paid By
                    </span>
                    <span className="text-xl font-bold text-emerald-400 mt-1 block">
                      {result.paid_by}
                    </span>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs text-slate-400 block font-medium">
                      Sum of Person Totals
                    </span>
                    <span className="text-xl font-bold text-white mt-1 block">
                      ₹{result.reconciliation.sum_of_person_totals}
                    </span>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4">
                    <span className="text-xs text-slate-400 block font-medium">
                      Reconciliation
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full mt-2 ${
                        result.reconciliation.matches_bill
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {result.reconciliation.matches_bill ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5" /> Mismatch
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Settle Up Cards */}
                {result.settle_up.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-emerald-400" />
                      Settle-Up Instructions
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {result.settle_up.map((transfer, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">
                              {transfer.from}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                            <span className="font-semibold text-emerald-400">
                              {transfer.to}
                            </span>
                          </div>
                          <span className="font-bold text-white bg-slate-800 px-2.5 py-1 rounded-lg">
                            ₹{transfer.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per Person Breakdown Table */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    Per-Person Breakdown
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                      <thead className="text-xs uppercase bg-slate-950/60 text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-3">Name</th>
                          <th className="py-3 px-3">Items Consumed</th>
                          <th className="py-3 px-3 text-right">Subtotal</th>
                          <th className="py-3 px-3 text-right">Tax</th>
                          <th className="py-3 px-3 text-right">Service</th>
                          <th className="py-3 px-3 text-right">Discount</th>
                          <th className="py-3 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {result.per_person.map((person, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-3.5 px-3 font-semibold text-white">
                              {person.name}
                            </td>
                            <td className="py-3.5 px-3 text-xs text-slate-400 max-w-xs">
                              {person.items.join(', ') || 'Default split items'}
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              ₹{person.subtotal}
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              ₹{person.tax_share}
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              ₹{person.service_share}
                            </td>
                            <td className="py-3.5 px-3 text-right text-emerald-400">
                              {person.discount_share !== 0
                                ? `₹${person.discount_share}`
                                : '₹0'}
                            </td>
                            <td className="py-3.5 px-3 text-right font-bold text-white">
                              ₹{person.total}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Assumptions Section */}
                {result.assumptions.length > 0 && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 text-xs text-blue-300 space-y-2">
                    <div className="font-semibold flex items-center gap-1.5 text-blue-200">
                      <Info className="w-4 h-4" />
                      Assumptions Made
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-slate-300">
                      {result.assumptions.map((asm, idx) => (
                        <li key={idx}>{asm}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Flags / Warnings Section */}
                {result.flags.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-300 space-y-2">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-200">
                      <AlertTriangle className="w-4 h-4" />
                      System Flags & Warnings
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-amber-200">
                      {result.flags.map((flag, idx) => (
                        <li key={idx}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
