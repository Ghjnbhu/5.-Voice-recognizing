import React, { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [diagnosticLogs, setDiagnosticLogs] = useState([])
  
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const restartTimeoutRef = useRef(null)
  const isListeningRef = useRef(false)

  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'pt-PT', name: 'Português' },
    { code: 'ru-RU', name: 'Русский' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'zh-CN', name: '中文' },
  ]

  const addDiagnosticLog = (type, message, details = '') => {
    const timestamp = new Date().toLocaleTimeString()
    setDiagnosticLogs(prev => [{ type, message, details, timestamp }, ...prev].slice(0, 20))
  }

  const updateMicrophoneLevel = useCallback(() => {
    if (!analyserNodeRef.current) return
    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount)
    analyserNodeRef.current.getByteTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128
      sum += v * v
    }
    const level = Math.min(100, Math.floor(Math.sqrt(sum / dataArray.length) * 200))
    setMicrophoneLevel(level)
    animationFrameRef.current = requestAnimationFrame(updateMicrophoneLevel)
  }, [])

  const startMicrophoneVisualization = useCallback(async () => {
    try {
      // Release any existing lock first
      if (audioContextRef.current) await audioContextRef.current.close();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserNodeRef.current = audioContextRef.current.createAnalyser()
      analyserNodeRef.current.fftSize = 256
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream)
      sourceNode.connect(analyserNodeRef.current)
      
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume()
      updateMicrophoneLevel()
    } catch (err) {
      addDiagnosticLog('WARNING', 'Visualizer failed', err.message)
    }
  }, [updateMicrophoneLevel])

  const stopMicrophoneVisualization = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    setMicrophoneLevel(0)
  }, [])

  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return null

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = selectedLanguage

    recognition.onstart = () => {
      addDiagnosticLog('SUCCESS', '🎤 Engine Started')
      // Trigger visualizer ONLY after recognition successfully claims the mic
      startMicrophoneVisualization()
    }

    recognition.onresult = (event) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript + ' '
      }
      if (text) setTranscript(prev => prev + text)
    }

    recognition.onend = () => {
      stopMicrophoneVisualization()
      if (isListeningRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          try { recognition.start() } catch (e) { addDiagnosticLog('ERROR', 'Restart failed') }
        }, 350)
      }
    }

    return recognition
  }, [selectedLanguage, startMicrophoneVisualization, stopMicrophoneVisualization])

  useEffect(() => {
    recognitionRef.current = initRecognition()
    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) recognitionRef.current.abort()
      stopMicrophoneVisualization()
    }
  }, [initRecognition, stopMicrophoneVisualization])

  const startListening = () => {
    setError('')
    setIsListening(true)
    isListeningRef.current = true
    try {
      recognitionRef.current.start()
    } catch (err) {
      setError('Error: ' + err.message)
    }
  }

  const stopListening = () => {
    isListeningRef.current = false
    setIsListening(false)
    stopMicrophoneVisualization()
    if (recognitionRef.current) recognitionRef.current.stop()
  }

  return (
    <div className="container">
      <h1>🎙️ Voice Recognition</h1>
      <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} disabled={isListening}>
        {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>

      <div className="microphone-level-container">
        <div className="level-bar-bg" style={{width: '100%', height: '20px', background: '#eee'}}>
          <div className="level-bar-fill" style={{ width: `${microphoneLevel}%`, height: '100%', background: '#4caf50' }} />
        </div>
      </div>

      <div className="button-group">
        <button onClick={startListening} disabled={isListening}>Start</button>
        <button onClick={stopListening} disabled={!isListening}>Stop</button>
      </div>

      <div className="transcript-box">{transcript}</div>
      <div className="console-logs">
        {diagnosticLogs.map((log, i) => <div key={i}>{log.message}</div>)}
      </div>
    </div>
  )
}

export default App