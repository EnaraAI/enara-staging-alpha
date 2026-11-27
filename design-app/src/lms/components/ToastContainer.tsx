import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { toast, ToastMessage } from '../services/toastService';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe((newToast) => {
      setToasts((prev) => [...prev, newToast]);

      if (newToast.duration !== 0) {
        setTimeout(() => {
          removeToast(newToast.id);
        }, newToast.duration || 5000);
      }
    });

    return () => unsubscribe();
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none px-4">
      <AnimatePresence>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-xl border text-sm backdrop-blur-md ${
              item.type === 'error'
                ? 'bg-rose-900/95 text-rose-50 border-rose-700/60 shadow-rose-950/30'
                : item.type === 'success'
                ? 'bg-emerald-900/95 text-emerald-50 border-emerald-700/60 shadow-emerald-950/30'
                : item.type === 'warning'
                ? 'bg-amber-900/95 text-amber-50 border-amber-700/60 shadow-amber-950/30'
                : 'bg-slate-900/95 text-slate-50 border-slate-700/60 shadow-slate-950/30'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {item.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-300" />}
              {item.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-300" />}
              {item.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-300" />}
              {item.type === 'info' && <Info className="w-5 h-5 text-blue-300" />}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-bold tracking-tight text-white">{item.title}</h4>
              <p className="mt-0.5 text-xs opacity-90 leading-relaxed break-words">{item.message}</p>
            </div>

            <button
              onClick={() => removeToast(item.id)}
              className="shrink-0 text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close toast"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
