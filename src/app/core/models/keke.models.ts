export type VehicleStatus = 'Active' | 'Under Repair' | 'Inactive' | 'Sold';

export type ExpenseCategory = 
  | 'Fuel Support' 
  | 'Tire' 
  | 'Repair' 
  | 'Engine' 
  | 'Registration' 
  | 'Union Fees' 
  | 'Police Issue' 
  | 'Miscellaneous';

export interface Tricycle {
  id?: string;
  plate_number: string;
  color: string;
  purchase_cost: number;
  registration_date: string;
  status: VehicleStatus;
  created_at?: string;
}

export interface Rider {
  id?: string;
  name: string;
  phone: string;
  address: string;
  national_id?: string;
  emergency_contact: string;
  created_at?: string;
}

export interface RiderAssignment {
  id?: string;
  rider_id: string;
  tricycle_id: string;
  start_date: string;
  end_date?: string;
  agreement_amount: number;
  payment_cycle_days: number;
  last_payment_date?: string;
  next_due_date?: string;
  is_active: boolean;
  rider?: Rider;
  tricycle?: Tricycle;
}

export interface Income {
  id?: string;
  amount: number;
  payment_date: string;
  rider_id?: string;
  tricycle_id: string;
  notes?: string;
}

export interface Expense {
  id?: string;
  amount: number;
  expense_date: string;
  category: ExpenseCategory;
  description: string;
  tricycle_id: string;
}

export interface LedgerItem {
  id: string;
  txn_date: string;
  amount: number;
  txn_type: 'income' | 'expense';
  category?: string;
  description?: string;
  tricycle_id: string;
  rider_id?: string;
  created_at: string;
}

export interface DashboardMetrics {
  expectedIncomeMonth: number;
  receivedIncomeMonth: number;
  outstandingAmount: number;
  totalExpensesMonth: number;
  netProfitMonth: number;
  overdueCount: number;
}