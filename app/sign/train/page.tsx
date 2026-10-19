import type { Metadata } from 'next'
import { TrainingStudio } from '@/components/sign/training-studio'
import './training.css'

export const metadata: Metadata = { title: 'Training Studio — Yap & Render', description: 'Record, review and save your own ISL landmark samples on this device.' }

export default function TrainingPage() { return <TrainingStudio /> }
