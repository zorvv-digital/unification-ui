import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Product } from '../../services/productApi';

export type FilterType = 'all' | 'whatsapp' | 'instagram' | 'messenger' | 'gmail' | 'website' | 'unread' | 'needs-human' | 'assigned';

interface FilterBarProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  products: Product[];
  activeProductId?: string;
  onProductChange: (productId?: string) => void;
  onCreateProduct: (name: string, description: string, keywords: string[]) => Promise<void>;
}

export const FilterBar: React.FC<FilterBarProps> = ({ 
  activeFilter, 
  onFilterChange,
  products,
  activeProductId,
  onProductChange,
  onCreateProduct,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const addKeyword = (value: string) => {
    const keyword = value.trim().replace(/,$/, '').trim();
    if (keyword && !keywords.some(item => item.toLowerCase() === keyword.toLowerCase()) && keywords.length < 20) {
      setKeywords(items => [...items, keyword]);
    }
    setKeywordInput('');
  };

  const close = () => {
    setIsOpen(false);
    setName('');
    setDescription('');
    setKeywordInput('');
    setKeywords([]);
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const finalKeywords = keywordInput.trim() ? [...keywords, keywordInput.trim()] : keywords;
    setSaving(true);
    setError('');
    try {
      await onCreateProduct(name.trim(), description.trim(), [...new Set(finalKeywords)]);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center px-4 py-3 border-b border-[var(--color-brand-border)] shrink-0 gap-2">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => { onFilterChange('all'); onProductChange(undefined); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${!activeProductId && activeFilter === 'all' ? 'bg-[var(--color-brand-text)] text-white' : 'bg-white border border-gray-300 text-[var(--color-brand-text-secondary)] hover:bg-gray-50'}`}
        >
          All
        </button>
        {products.map(product => (
          <button
            key={product.id}
            onClick={() => { onFilterChange('all'); onProductChange(activeProductId === product.id ? undefined : product.id); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border ${activeProductId === product.id ? 'text-white border-transparent' : 'bg-white text-[var(--color-brand-text-secondary)] border-gray-300 hover:bg-gray-50'}`}
            style={activeProductId === product.id ? { backgroundColor: product.color } : undefined}
          >
            {product.name}
          </button>
        ))}
      </div>
      <button
        onClick={() => setIsOpen(true)}
        className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-white border border-dashed border-gray-400 text-[var(--color-brand-text-secondary)] hover:bg-gray-50 flex items-center gap-1"
      >
        <Plus size={13} /> Add Product
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onMouseDown={event => event.target === event.currentTarget && close()}>
          <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" aria-label="Add product">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Add Product</h2>
                <p className="mt-1 text-sm text-gray-500">Create a product-based inbox segment.</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={18} /></button>
            </div>

            <label className="block text-sm font-medium text-gray-700" htmlFor="product-name">Product name</label>
            <input id="product-name" autoFocus maxLength={80} required value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Sunscreen" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200" />

            <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="product-description">Description <span className="font-normal text-gray-400">(optional)</span></label>
            <textarea
              id="product-description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Describe the product so the AI can recognize customer interest."
              rows={3}
              className="mt-1.5 w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            />

            <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="product-keywords">Related keywords</label>
            <p className="mt-1 text-xs text-gray-500">Type a keyword and press comma or Enter.</p>
            <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-gray-300 p-2 focus-within:border-gray-500 focus-within:ring-2 focus-within:ring-gray-200">
              {keywords.map(keyword => (
                <span key={keyword} className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                  {keyword}
                  <button type="button" onClick={() => setKeywords(items => items.filter(item => item !== keyword))} aria-label={`Remove ${keyword}`} className="rounded-full text-gray-400 hover:text-gray-900"><X size={12} /></button>
                </span>
              ))}
              <input
                id="product-keywords"
                value={keywordInput}
                maxLength={40}
                onChange={event => {
                  const value = event.target.value;
                  if (value.endsWith(',')) addKeyword(value);
                  else setKeywordInput(value);
                }}
                onKeyDown={event => {
                  if ((event.key === 'Enter' || event.key === ',') && keywordInput.trim()) {
                    event.preventDefault();
                    addKeyword(keywordInput);
                  } else if (event.key === 'Backspace' && !keywordInput && keywords.length) {
                    setKeywords(items => items.slice(0, -1));
                  }
                }}
                placeholder={keywords.length ? 'Add another...' : 'spf, sunblock, sunscreen'}
                className="min-w-32 flex-1 border-0 px-1 py-1 text-sm outline-none"
              />
            </div>

            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={close} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Adding...' : 'Add Product'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
