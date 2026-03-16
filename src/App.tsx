/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, Component } from 'react';
import { 
  Plus, 
  Minus, 
  Trash2, 
  Edit2, 
  Package, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Wallet, 
  History, 
  LayoutDashboard,
  LogOut,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  X,
  PlusCircle,
  FileDown,
  Search,
  Warehouse as WarehouseIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  Timestamp,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { db, auth } from './firebase';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Si è verificato un errore imprevisto.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error) {
          errorMessage = `Errore Firebase (${parsedError.operationType}): ${parsedError.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-linear-to-br from-pink-50 to-rose-100 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={40} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">Ops! Qualcosa è andato storto</h1>
            <p className="text-gray-600">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              Ricarica Pagina
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Types ---
interface Warehouse {
  id: string;
  name: string;
  ownerUid: string;
  createdAt: any;
}

interface Transaction {
  id: string;
  warehouseId: string;
  type: 'in' | 'out';
  date: any;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  createdAt: any;
}

interface InventoryItem {
  id: string;
  warehouseId: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  lastUpdated: any;
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) => {
  const variants = {
    primary: 'bg-linear-to-r from-pink-400 to-rose-400 text-white hover:from-pink-500 hover:to-rose-500 shadow-md',
    secondary: 'bg-linear-to-r from-purple-400 to-indigo-400 text-white hover:from-purple-500 hover:to-indigo-500 shadow-md',
    danger: 'bg-linear-to-r from-red-400 to-orange-400 text-white hover:from-red-500 hover:to-orange-500 shadow-md',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100'
  };

  return (
    <button 
      className={cn(
        'px-6 py-2.5 rounded-full font-medium transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode; className?: string; key?: React.Key }) => (
  <div className={cn('bg-white/80 backdrop-blur-md border border-white/20 rounded-3xl shadow-xl p-6', className)}>
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          onClick={onClose}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm" 
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-linear-to-r from-pink-50 to-rose-50">
            <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-full transition-colors">
              <X size={20} className="text-gray-500" />
            </button>
          </div>
          <div className="p-6">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string }) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title}>
    <div className="space-y-6">
      <p className="text-gray-600">{message}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button variant="danger" onClick={onConfirm}>Conferma</Button>
      </div>
    </div>
  </Modal>
);

// --- Main App ---

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    name: ''
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  
  // UI States
  const [activeTab, setActiveTab] = useState<'movimenti' | 'giacenze'>('movimenti');
  const [isAddWarehouseOpen, setIsAddWarehouseOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'in' | 'out'>('in');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'warehouse' | 'transaction' | 'inventory' } | null>(null);
  const [isEditTransactionOpen, setIsEditTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditInventoryOpen, setIsEditInventoryOpen] = useState(false);
  const [editingInventoryItem, setEditingInventoryItem] = useState<InventoryItem | null>(null);
  const [isStockWarningOpen, setIsStockWarningOpen] = useState(false);
  const [stockWarningInfo, setStockWarningInfo] = useState<{ current: number; requested: number } | null>(null);

  // Form States
  const [newWarehouseName, setNewWarehouseName] = useState('');
  const [transForm, setTransForm] = useState({
    description: '',
    quantity: 1,
    unitCost: 0,
    date: format(new Date(), 'yyyy-MM-dd')
  });
  const [inventoryForm, setInventoryForm] = useState({
    description: '',
    quantity: 0,
    unitCost: 0
  });

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Fetch Warehouses
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'warehouses'), where('ownerUid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Warehouse)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'warehouses'));
    return unsubscribe;
  }, [user]);

  // Fetch Warehouse Data
  useEffect(() => {
    if (!selectedWarehouse) {
      setTransactions([]);
      setInventory([]);
      return;
    }

    const tQ = query(collection(db, `warehouses/${selectedWarehouse.id}/transactions`), orderBy('date', 'desc'));
    const tUnsub = onSnapshot(tQ, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `warehouses/${selectedWarehouse.id}/transactions`));

    const iQ = query(collection(db, `warehouses/${selectedWarehouse.id}/inventory`), orderBy('description', 'asc'));
    const iUnsub = onSnapshot(iQ, (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `warehouses/${selectedWarehouse.id}/inventory`));

    return () => {
      tUnsub();
      iUnsub();
    };
  }, [selectedWarehouse]);

  // Calculations
  const stats = useMemo(() => {
    const totalIn = transactions.filter(t => t.type === 'in').reduce((acc, t) => acc + t.totalCost, 0);
    const totalOut = transactions.filter(t => t.type === 'out').reduce((acc, t) => acc + t.totalCost, 0);
    return {
      balance: totalIn - totalOut,
      totalIn,
      totalOut
    };
  }, [transactions]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => 
      item.description.toLowerCase().includes(inventorySearch.toLowerCase())
    );
  }, [inventory, inventorySearch]);

  // Actions
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (authMode === 'signup') {
        if (!authForm.name.trim()) {
          throw new Error('Il nome è obbligatorio');
        }
        const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        await updateProfile(userCredential.user, {
          displayName: authForm.name
        });
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
      }
    } catch (err: any) {
      console.error(err);
      let message = 'Si è verificato un errore durante l\'autenticazione.';
      if (err.code === 'auth/email-already-in-use') message = 'Questa email è già in uso.';
      if (err.code === 'auth/invalid-email') message = 'Email non valida.';
      if (err.code === 'auth/weak-password') message = 'La password è troppo debole.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = 'Credenziali non valide.';
      }
      setAuthError(err.message || message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateWarehouse = async () => {
    if (!user || !newWarehouseName.trim()) return;
    try {
      await addDoc(collection(db, 'warehouses'), {
        name: newWarehouseName,
        ownerUid: user.uid,
        createdAt: serverTimestamp()
      });
      setNewWarehouseName('');
      setIsAddWarehouseOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'warehouses');
    }
  };

  const handleDeleteWarehouse = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'warehouses', id));
      if (selectedWarehouse?.id === id) setSelectedWarehouse(null);
      setIsDeleteConfirmOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'warehouses');
    }
  };

  const handleAddTransaction = async (force = false) => {
    if (!selectedWarehouse) return;
    const { description, quantity, unitCost, date } = transForm;
    const totalCost = quantity * unitCost;

    // Check stock for outgoing transactions
    if (transactionType === 'out' && !force) {
      const existingItem = inventory.find(item => item.description.toLowerCase().trim() === description.toLowerCase().trim());
      const currentStock = existingItem ? existingItem.quantity : 0;
      
      if (quantity > currentStock) {
        setStockWarningInfo({ current: currentStock, requested: quantity });
        setIsStockWarningOpen(true);
        return;
      }
    }

    try {
      // 1. Add Transaction
      await addDoc(collection(db, `warehouses/${selectedWarehouse.id}/transactions`), {
        warehouseId: selectedWarehouse.id,
        type: transactionType,
        date: Timestamp.fromDate(new Date(date)),
        description,
        quantity,
        unitCost,
        totalCost,
        createdAt: serverTimestamp()
      });

      // 2. Update Inventory
      const inventoryRef = doc(db, `warehouses/${selectedWarehouse.id}/inventory`, description.toLowerCase().trim());
      const invSnap = await getDoc(inventoryRef);

      if (invSnap.exists()) {
        const currentData = invSnap.data() as InventoryItem;
        const newQuantity = transactionType === 'in' ? currentData.quantity + quantity : currentData.quantity - quantity;
        await updateDoc(inventoryRef, {
          quantity: newQuantity,
          unitCost: transactionType === 'in' ? unitCost : currentData.unitCost, // Update cost on entry
          totalValue: newQuantity * (transactionType === 'in' ? unitCost : currentData.unitCost),
          lastUpdated: serverTimestamp()
        });
      } else {
        await setDoc(inventoryRef, {
          warehouseId: selectedWarehouse.id,
          description,
          quantity: transactionType === 'in' ? quantity : -quantity,
          unitCost,
          totalValue: quantity * unitCost,
          lastUpdated: serverTimestamp()
        });
      }

      setTransForm({ description: '', quantity: 1, unitCost: 0, date: format(new Date(), 'yyyy-MM-dd') });
      setIsTransactionModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'transactions/inventory');
    }
  };

  const handleDeleteTransaction = async (t: Transaction) => {
    if (!selectedWarehouse) return;
    try {
      // Revert inventory
      const inventoryRef = doc(db, `warehouses/${selectedWarehouse.id}/inventory`, t.description.toLowerCase().trim());
      const invSnap = await getDoc(inventoryRef);
      if (invSnap.exists()) {
        const currentData = invSnap.data() as InventoryItem;
        const newQuantity = t.type === 'in' ? currentData.quantity - t.quantity : currentData.quantity + t.quantity;
        await updateDoc(inventoryRef, {
          quantity: newQuantity,
          totalValue: newQuantity * currentData.unitCost,
          lastUpdated: serverTimestamp()
        });
      }

      await deleteDoc(doc(db, `warehouses/${selectedWarehouse.id}/transactions`, t.id));
      setIsDeleteConfirmOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'transactions');
    }
  };

  const handleEditInventory = async () => {
    if (!selectedWarehouse || !editingInventoryItem) return;
    try {
      const inventoryRef = doc(db, `warehouses/${selectedWarehouse.id}/inventory`, editingInventoryItem.id);
      await updateDoc(inventoryRef, {
        description: inventoryForm.description,
        quantity: inventoryForm.quantity,
        unitCost: inventoryForm.unitCost,
        totalValue: inventoryForm.quantity * inventoryForm.unitCost,
        lastUpdated: serverTimestamp()
      });
      setIsEditInventoryOpen(false);
      setEditingInventoryItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'inventory');
    }
  };

  const handleDeleteInventory = async (id: string) => {
    if (!selectedWarehouse) return;
    try {
      await deleteDoc(doc(db, `warehouses/${selectedWarehouse.id}/inventory`, id));
      setIsDeleteConfirmOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'inventory');
    }
  };

  const generatePDF = () => {
    if (!selectedWarehouse) return;

    const doc = new jsPDF();
    const tableColumn = ["Descrizione", "Quantità", "Costo Unitario (€)", "Valore Totale (€)"];
    const tableRows: any[] = [];

    inventory.forEach(item => {
      const itemData = [
        item.description,
        item.quantity,
        item.unitCost.toFixed(2),
        item.totalValue.toFixed(2),
      ];
      tableRows.push(itemData);
    });

    const totalValue = inventory.reduce((acc, item) => acc + item.totalValue, 0);

    doc.setFontSize(18);
    doc.text(`Report Inventario: ${selectedWarehouse.name}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 30);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      theme: 'grid',
      headStyles: { fillColor: [244, 114, 182] }, // pink-400 equivalent
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Valore Totale Magazzino: € ${totalValue.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, 14, finalY);

    doc.save(`inventario_${selectedWarehouse.name.toLowerCase().replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-pink-50 via-rose-50 to-purple-50 flex items-center justify-center">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} 
          transition={{ repeat: Infinity, duration: 2 }}
          className="flex flex-col items-center gap-4"
        >
          <WarehouseIcon size={48} className="text-rose-400" />
          <p className="text-rose-400 font-medium tracking-widest uppercase text-xs">Caricamento...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-linear-to-br from-pink-100 via-rose-100 to-purple-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center space-y-8 p-8 sm:p-12">
          <div className="space-y-4">
            <div className="w-16 h-16 bg-linear-to-br from-pink-400 to-rose-400 rounded-2xl mx-auto flex items-center justify-center shadow-lg transform -rotate-6">
              <WarehouseIcon size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Magazzino</h1>
            <p className="text-gray-500 text-sm">Gestisci le tue scorte con eleganza e semplicità.</p>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
            {authMode === 'signup' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-2">Nome</label>
                <input 
                  type="text" 
                  required
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  placeholder="Il tuo nome"
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-2">Email</label>
              <input 
                type="email" 
                required
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                placeholder="email@esempio.com"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-2">Password</label>
              <input 
                type="password" 
                required
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
              />
            </div>

            {authError && (
              <div className="p-3 bg-rose-50 text-rose-500 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{authError}</span>
              </div>
            )}

            <Button type="submit" disabled={authLoading} className="w-full py-3">
              {authLoading ? 'Caricamento...' : authMode === 'login' ? 'Accedi' : 'Registrati'}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400">Oppure</span>
            </div>
          </div>

          <Button onClick={handleLogin} variant="ghost" className="w-full py-3 border border-gray-100 shadow-sm">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2" />
            Accedi con Google
          </Button>

          <p className="text-sm text-gray-500">
            {authMode === 'login' ? 'Non hai un account?' : 'Hai già un account?'}
            <button 
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError(null);
              }}
              className="ml-1 text-pink-500 font-bold hover:underline"
            >
              {authMode === 'login' ? 'Registrati' : 'Accedi'}
            </button>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-pink-50 via-rose-50 to-purple-50 text-gray-800 font-sans pb-20">
      {/* Header */}
      <header className="bg-white/40 backdrop-blur-md sticky top-0 z-30 border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedWarehouse(null)}>
            <div className="p-2 bg-linear-to-br from-pink-400 to-rose-400 rounded-xl shadow-md">
              <WarehouseIcon size={24} className="text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight bg-linear-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
              Magazzino
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold text-gray-700">{user.displayName}</span>
              <span className="text-xs text-gray-400">{user.email}</span>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="p-2 hover:bg-rose-100 rounded-full text-rose-500 transition-colors"
              title="Esci"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {!selectedWarehouse ? (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold text-gray-800">I Tuoi Magazzini</h2>
              <Button onClick={() => setIsAddWarehouseOpen(true)} className="gap-2">
                <Plus size={20} /> Nuovo Magazzino
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {warehouses.map((w) => (
                <motion.div 
                  key={w.id} 
                  layoutId={w.id}
                  whileHover={{ y: -5 }}
                  className="group"
                >
                  <Card className="h-full flex flex-col justify-between hover:border-pink-200 transition-colors cursor-pointer relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToDelete({ id: w.id, type: 'warehouse' });
                          setIsDeleteConfirmOpen(true);
                        }}
                        className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    
                    <div onClick={() => setSelectedWarehouse(w)} className="space-y-4">
                      <div className="w-12 h-12 bg-pink-50 rounded-2xl flex items-center justify-center text-pink-400">
                        <Package size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-800">{w.name}</h3>
                        <p className="text-sm text-gray-400">
                          Creato il {w.createdAt ? format(w.createdAt.toDate(), 'dd MMM yyyy', { locale: it }) : '...'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between text-pink-500 font-medium">
                      <span>Apri Magazzino</span>
                      <ChevronRight size={20} />
                    </div>
                  </Card>
                </motion.div>
              ))}
              
              {warehouses.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="w-20 h-20 bg-gray-100 rounded-full mx-auto flex items-center justify-center text-gray-300">
                    <WarehouseIcon size={40} />
                  </div>
                  <p className="text-gray-400 text-lg">Non hai ancora creato nessun magazzino.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setSelectedWarehouse(null)}
                  className="p-2 hover:bg-white rounded-full text-gray-400 transition-colors"
                >
                  <X size={24} />
                </button>
                <div>
                  <h2 className="text-3xl font-bold text-gray-800">{selectedWarehouse.name}</h2>
                  <p className="text-gray-500">Panoramica e gestione scorte</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  onClick={() => { setTransactionType('in'); setIsTransactionModalOpen(true); }}
                  className="bg-linear-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500"
                >
                  <ArrowUpCircle size={20} /> Entrata
                </Button>
                <Button 
                  onClick={() => { setTransactionType('out'); setIsTransactionModalOpen(true); }}
                  variant="danger"
                >
                  <ArrowDownCircle size={20} /> Uscita
                </Button>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex p-1 bg-white/40 backdrop-blur-sm rounded-2xl border border-white/20 w-fit">
              <button 
                onClick={() => setActiveTab('movimenti')}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                  activeTab === 'movimenti' ? "bg-white text-pink-500 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <History size={18} /> Movimenti
              </button>
              <button 
                onClick={() => setActiveTab('giacenze')}
                className={cn(
                  "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                  activeTab === 'giacenze' ? "bg-white text-pink-500 shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Package size={18} /> Giacenze
              </button>
            </div>

            {/* Main Content Area */}
            <AnimatePresence mode="wait">
              {activeTab === 'movimenti' ? (
                <motion.div 
                  key="movimenti"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-8"
                >
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-linear-to-br from-pink-500 to-rose-500 text-white border-none">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-pink-100 text-sm font-medium uppercase tracking-wider">Cassa Totale</p>
                          <h3 className="text-4xl font-bold mt-1">€ {stats.balance.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</h3>
                        </div>
                        <div className="p-3 bg-white/20 rounded-2xl">
                          <Wallet size={24} />
                        </div>
                      </div>
                    </Card>
                    
                    <Card className="bg-white/60">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl">
                          <ArrowUpCircle size={24} />
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Totale Entrate</p>
                          <p className="text-2xl font-bold text-emerald-600">€ {stats.totalIn.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-white/60">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-rose-50 text-rose-500 rounded-2xl">
                          <ArrowDownCircle size={24} />
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Totale Uscite</p>
                          <p className="text-2xl font-bold text-rose-600">€ {stats.totalOut.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Transactions Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-gray-800">
                      <History size={20} className="text-pink-400" />
                      <h3 className="text-xl font-bold">Estratto Conto</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Entrate */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Entrate
                        </h4>
                        <div className="bg-white rounded-3xl overflow-hidden border border-white/20 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-emerald-50/50 text-emerald-700 text-xs uppercase tracking-wider">
                                  <th className="px-6 py-4 font-bold">Data</th>
                                  <th className="px-6 py-4 font-bold">Descrizione</th>
                                  <th className="px-6 py-4 font-bold text-right">Q.tà</th>
                                  <th className="px-6 py-4 font-bold text-right">Unitario</th>
                                  <th className="px-6 py-4 font-bold text-right">Totale</th>
                                  <th className="px-6 py-4 font-bold text-center">Azioni</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {transactions.filter(t => t.type === 'in').map((t) => (
                                  <tr key={t.id} className="hover:bg-white/50 transition-colors group">
                                    <td className="px-6 py-4 text-sm text-gray-500">{format(t.date.toDate(), 'dd/MM/yy')}</td>
                                    <td className="px-6 py-4 font-medium">{t.description}</td>
                                    <td className="px-6 py-4 text-right font-mono">{t.quantity}</td>
                                    <td className="px-6 py-4 text-right font-mono">€{t.unitCost.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-emerald-600">€{t.totalCost.toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                          onClick={() => { setItemToDelete({ id: t.id, type: 'transaction' }); setEditingTransaction(t); setIsDeleteConfirmOpen(true); }}
                                          className="p-1.5 text-gray-400 hover:text-rose-500 transition-colors"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {transactions.filter(t => t.type === 'in').length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400 italic">Nessuna entrata registrata</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Uscite */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-rose-600 uppercase tracking-widest flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Uscite
                        </h4>
                        <div className="bg-white rounded-3xl overflow-hidden border border-white/20 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-rose-50/50 text-rose-700 text-xs uppercase tracking-wider">
                                  <th className="px-6 py-4 font-bold">Data</th>
                                  <th className="px-6 py-4 font-bold">Descrizione</th>
                                  <th className="px-6 py-4 font-bold text-right">Q.tà</th>
                                  <th className="px-6 py-4 font-bold text-right">Unitario</th>
                                  <th className="px-6 py-4 font-bold text-right">Totale</th>
                                  <th className="px-6 py-4 font-bold text-center">Azioni</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {transactions.filter(t => t.type === 'out').map((t) => (
                                  <tr key={t.id} className="hover:bg-white/50 transition-colors group">
                                    <td className="px-6 py-4 text-sm text-gray-500">{format(t.date.toDate(), 'dd/MM/yy')}</td>
                                    <td className="px-6 py-4 font-medium">{t.description}</td>
                                    <td className="px-6 py-4 text-right font-mono">{t.quantity}</td>
                                    <td className="px-6 py-4 text-right font-mono">€{t.unitCost.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-rose-600">€{t.totalCost.toFixed(2)}</td>
                                    <td className="px-6 py-4">
                                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                          onClick={() => { setItemToDelete({ id: t.id, type: 'transaction' }); setEditingTransaction(t); setIsDeleteConfirmOpen(true); }}
                                          className="p-1.5 text-gray-400 hover:text-rose-500 transition-colors"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {transactions.filter(t => t.type === 'out').length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400 italic">Nessuna uscita registrata</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="giacenze"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between gap-2 text-gray-800">
                    <div className="flex items-center gap-2">
                      <Package size={20} className="text-pink-400" />
                      <h3 className="text-xl font-bold">Giacenze Magazzino</h3>
                    </div>
                    <Button 
                      onClick={generatePDF} 
                      variant="secondary" 
                      className="text-xs py-2 px-4"
                      disabled={inventory.length === 0}
                    >
                      <FileDown size={16} /> Scarica Report PDF
                    </Button>
                  </div>
                  
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text"
                      placeholder="Cerca prodotto per descrizione..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/60 backdrop-blur-sm border border-white/20 rounded-2xl focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all shadow-sm"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    {filteredInventory.map((item) => (
                      <motion.div 
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-2xl transition-all group shadow-sm",
                          "bg-white hover:bg-white/90 border border-white/20",
                          item.quantity <= 5 ? "border-rose-300 ring-1 ring-rose-100" : ""
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
                            item.quantity <= 5 ? "bg-rose-100 text-rose-500" : "bg-pink-100 text-pink-500"
                          )}>
                            <Package size={24} />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-800 capitalize flex items-center gap-2">
                              {item.description}
                              {item.quantity <= 5 && (
                                <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  Esaurimento
                                </span>
                              )}
                            </h4>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <PlusCircle size={14} className="text-pink-300" />
                                Q.tà: <span className="font-bold text-gray-700">{item.quantity}</span>
                              </span>
                              <span className="text-sm text-gray-500 flex items-center gap-1">
                                <Wallet size={14} className="text-pink-300" />
                                Unit: <span className="font-bold text-gray-700">€{item.unitCost.toFixed(2)}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Valore Totale</p>
                            <p className="text-xl font-bold text-gray-800">€{item.totalValue.toFixed(2)}</p>
                          </div>
                          
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingInventoryItem(item);
                                setInventoryForm({
                                  description: item.description,
                                  quantity: item.quantity,
                                  unitCost: item.unitCost
                                });
                                setIsEditInventoryOpen(true);
                              }}
                              className="p-2 bg-white rounded-full text-gray-400 hover:text-pink-500 shadow-sm transition-all hover:scale-110"
                              title="Modifica"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={() => {
                                setItemToDelete({ id: item.id, type: 'inventory' });
                                setIsDeleteConfirmOpen(true);
                              }}
                              className="p-2 bg-white rounded-full text-gray-400 hover:text-rose-500 shadow-sm transition-all hover:scale-110"
                              title="Elimina"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    
                    {inventory.length === 0 && (
                      <div className="py-20 text-center space-y-4 bg-white/20 rounded-3xl border border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-gray-50 rounded-full mx-auto flex items-center justify-center text-gray-300">
                          <Package size={32} />
                        </div>
                        <p className="text-gray-400 italic">Magazzino vuoto. Inizia registrando un'entrata.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Modals */}
      <Modal 
        isOpen={isAddWarehouseOpen} 
        onClose={() => setIsAddWarehouseOpen(false)} 
        title="Nuovo Magazzino"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Magazzino</label>
            <input 
              type="text" 
              value={newWarehouseName}
              onChange={(e) => setNewWarehouseName(e.target.value)}
              placeholder="Es. Magazzino Centrale"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
            />
          </div>
          <Button onClick={handleCreateWarehouse} className="w-full">Crea Magazzino</Button>
        </div>
      </Modal>

      <Modal 
        isOpen={isTransactionModalOpen} 
        onClose={() => setIsTransactionModalOpen(false)} 
        title={transactionType === 'in' ? 'Registra Entrata' : 'Registra Uscita'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione Prodotto</label>
            <input 
              type="text" 
              value={transForm.description}
              onChange={(e) => setTransForm({ ...transForm, description: e.target.value })}
              placeholder="Es. Maglietta Rosa"
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantità</label>
              <input 
                type="number" 
                value={transForm.quantity}
                onChange={(e) => setTransForm({ ...transForm, quantity: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo Unitario (€)</label>
              <input 
                type="number" 
                step="0.01"
                value={transForm.unitCost}
                onChange={(e) => setTransForm({ ...transForm, unitCost: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
            <input 
              type="date" 
              value={transForm.date}
              onChange={(e) => setTransForm({ ...transForm, date: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div className="pt-2">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-gray-500 font-medium">Totale:</span>
              <span className="text-2xl font-bold text-gray-800">€ {(transForm.quantity * transForm.unitCost).toFixed(2)}</span>
            </div>
            <Button onClick={() => handleAddTransaction(false)} className="w-full">Conferma Operazione</Button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isEditInventoryOpen} 
        onClose={() => setIsEditInventoryOpen(false)} 
        title="Modifica Prodotto"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
            <input 
              type="text" 
              value={inventoryForm.description}
              onChange={(e) => setInventoryForm({ ...inventoryForm, description: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantità</label>
              <input 
                type="number" 
                value={inventoryForm.quantity}
                onChange={(e) => setInventoryForm({ ...inventoryForm, quantity: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo Unitario (€)</label>
              <input 
                type="number" 
                step="0.01"
                value={inventoryForm.unitCost}
                onChange={(e) => setInventoryForm({ ...inventoryForm, unitCost: Number(e.target.value) })}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-pink-400 focus:border-transparent outline-none transition-all"
              />
            </div>
          </div>
          <div className="pt-2">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-gray-500 font-medium">Nuovo Valore:</span>
              <span className="text-2xl font-bold text-gray-800">€ {(inventoryForm.quantity * inventoryForm.unitCost).toFixed(2)}</span>
            </div>
            <Button onClick={handleEditInventory} className="w-full">Salva Modifiche</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal 
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (itemToDelete?.type === 'warehouse') handleDeleteWarehouse(itemToDelete.id);
          if (itemToDelete?.type === 'transaction' && editingTransaction) handleDeleteTransaction(editingTransaction);
          if (itemToDelete?.type === 'inventory') handleDeleteInventory(itemToDelete.id);
        }}
        title="Sei sicuro?"
        message={`Questa azione eliminerà definitivamente ${
          itemToDelete?.type === 'warehouse' ? 'il magazzino e tutti i suoi dati' : 
          itemToDelete?.type === 'transaction' ? 'questo movimento' : 'questo prodotto dal magazzino'
        }.`}
      />

      <ConfirmModal 
        isOpen={isStockWarningOpen}
        onClose={() => setIsStockWarningOpen(false)}
        onConfirm={() => {
          setIsStockWarningOpen(false);
          handleAddTransaction(true);
        }}
        title="Attenzione: Scorta Insufficiente"
        message={`Stai registrando un'uscita di ${stockWarningInfo?.requested} unità, ma la giacenza attuale è di sole ${stockWarningInfo?.current} unità. Il saldo diventerà negativo. Vuoi procedere comunque?`}
      />
    </div>
  );
}
