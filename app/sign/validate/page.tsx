import type { Metadata } from 'next'
import { ValidationStudio } from '@/components/sign/validation-studio'
import '../train/training.css'
import './validation.css'

export const metadata: Metadata = { title: 'Signer Validation — Yap & Render', description: 'Run facilitated recognition sessions with consented ISL signers. Results stay on this device.' }

export default function ValidationPage() { return <ValidationStudio /> }
