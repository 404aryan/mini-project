import type { Metadata } from 'next'
import { WordTrainingStudio } from '@/components/sign/word-training-studio'
import '../training.css'

export const metadata: Metadata = { title: 'Word Training — Yap & Render', description: 'Record and review your own sign word motions locally on this device.' }
export default function WordTrainingPage() { return <WordTrainingStudio /> }
