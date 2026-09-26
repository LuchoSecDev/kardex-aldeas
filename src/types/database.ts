export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      kardex_records: {
        Row: {
          id: string
          community: string
          year: number
          month: number
          product_id: string
          prev_balances: number[]
          entries: number[]
          exits: number[]
          updated_at: string
        }
        Insert: {
          id?: string
          community: string
          year: number
          month: number
          product_id: string
          prev_balances?: number[]
          entries?: number[]
          exits?: number[]
          updated_at?: string
        }
        Update: {
          id?: string
          community?: string
          year?: number
          month?: number
          product_id?: string
          prev_balances?: number[]
          entries?: number[]
          exits?: number[]
          updated_at?: string
        }
      }
      ajustes: {
        Row: {
          id: string
          community: string
          product_id: string
          year: number
          month: number
          week_index: number
          saldo_anterior: number
          saldo_nuevo: number
          motivo: string
          created_at: string
        }
        Insert: {
          id?: string
          community: string
          product_id: string
          year: number
          month: number
          week_index: number
          saldo_anterior: number
          saldo_nuevo: number
          motivo: string
          created_at?: string
        }
        Update: {
          id?: string
          community?: string
          product_id?: string
          year?: number
          month?: number
          week_index?: number
          saldo_anterior?: number
          saldo_nuevo?: number
          motivo?: string
          created_at?: string
        }
      }
      communities: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
      }
    }
  }
}
