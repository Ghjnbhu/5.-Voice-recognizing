import React, { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [recognitionStatus, setRecognitionStatus] = useState('')
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const isAndroid = /Android/i.test(navigator.userAgent)

  // Language options
  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'pt-BR', name: 'Português' },
    { code: 'ru-RU', name: 'Русский' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'zh-CN', name: '中文' },
    { code: 'hi-IN', name: 'हिन्दी' },
  ]

  // Update microphone level
  const updateMicrophoneLevel = () => {
    if (!analyserNodeRef.current) return
    
    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount)
    analyserNodeRef.current.getByteTimeDomainData(dataArray)
    
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128
      sum += v * v
    }
    let average = Math.sqrt(sum / dataArray.length) || 0
    const level = Math.min(100, Math.floor(average * 200))
    setMicrophoneLevel(level)
    
    animationFrameRef.current = requestAnimationFrame(updateMicrophoneLevel)
  }

  // Start microphone visualization
  const startMicrophoneVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserNodeRef.current = audioContextRef.current.createAnalyser()
      analyserNodeRef.current.fftSize = 256
      
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream)
      sourceNode.connect(analyserNodeRef.current)
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      updateMicrophoneLevel()
    } catch (err) {
      console.error('Microphone visualization error:', err)
    }
  }

  const stopMicrophoneVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    setMicrophoneLevel(0)
  }

  // Initialize speech recognition
  const initRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported')
      return null
    }

    const recognition = new SpeechRecognition()
    // Critical: Use continuous=false for better Android compatibility
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      console.log('Recognition started')
      setRecognitionStatus('Listening... Speak now')
      setError('')
      startMicrophoneVisualization()
    }

    recognition.onresult = (event) => {
      console.log('Result received:', event.results)
      let finalText = ''
      let interimText = ''

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        
        if (result.isFinal) {
          finalText += text + ' '
          console.log('Final:', text)
        } else {
          interimText += text
          console.log('Interim:', text)
        }
      }

      if (finalText) {
        setTranscript(prev => prev + finalText)
      }
      
      // Update status with interim text for feedback
      if (interimText) {
        setRecognitionStatus(`Hearing: "${interimText}"`)
      }
    }

    recognition.onerror = (event) => {
      console.error('Recognition error:', event.error)
      
      switch (event.error) {
        case 'no-speech':
          setError('No speech detected. Please speak louder and try again.')
          setRecognitionStatus('No speech detected')
          break
        case 'audio-capture':
          setError('No microphone found.')
          setRecognitionStatus('Microphone error')
          break
        case 'not-allowed':
          setError('Microphone access denied. Check Chrome permissions.')
          setRecognitionStatus('Permission denied')
          break
        default:
          if (event.error !== 'aborted') {
            setError(`Error: ${event.error}`)
          }
      }
      
      setIsListening(false)
      stopMicrophoneVisualization()
    }

    recognition.onend = () => {
      console.log('Recognition ended')
      if (isListening) {
        // Only update status, don't auto-restart
        setRecognitionStatus('Stopped - click Start again')
        setIsListening(false)
        stopMicrophoneVisualization()
      } else {
        setRecognitionStatus('Ready')
        stopMicrophoneVisualization()
      }
    }

    recognition.onsoundstart = () => {
      console.log('Sound detected')
      setRecognitionStatus('Sound detected! Transcribing...')
    }

    recognition.onspeechend = () => {
      console.log('Speech ended')
      setRecognitionStatus('Processing speech...')
    }

    return recognition
  }

  useEffect(() => {
    // Check support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser')
      return
    }

    // Initialize
    recognitionRef.current = initRecognition()

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort()
        } catch (e) {}
      }
      stopMicrophoneVisualization()
    }
  }, [])

  // Re-init when language changes
  useEffect(() => {
    if (recognitionRef.current) {
      const oldRecognition = recognitionRef.current
      recognitionRef.current = initRecognition()
      try {
        oldRecognition.abort()
      } catch (e) {}
    }
  }, [selectedLanguage])

  const startListening = async () => {
    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition()
    }

    setError('')
    setRecognitionStatus('Requesting microphone...')
    
    try {
      // First, get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop()) // Release immediately
      
      // Start recognition
      recognitionRef.current.start()
      setIsListening(true)
    } catch (err) {
      console.error('Permission error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please:\n1. Tap the 🔒 icon in address bar\n2. Allow microphone access\n3. Refresh and try again')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found on this device')
      } else {
        setError(`Cannot access microphone: ${err.message}`)
      }
      setIsListening(false)
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.error('Stop error:', e)
      }
    }
    setIsListening(false)
    stopMicrophoneVisualization()
    setRecognitionStatus('Stopped')
  }

  const clearText = () => {
    setTranscript('')
  }

  const getLevelColor = () => {
    if (microphoneLevel < 20) return 'var(--level-low)'
    if (microphoneLevel < 50) return 'var(--level-medium-low)'
    if (microphoneLevel < 80) return 'var(--level-medium)'
    return 'var(--level-high)'
  }

  return (
    <div className="container">
      <h1>🎙️ Voice Recognition</h1>
      <p className="subtitle">Press Start, speak, then press Start again for more</p>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Language Selection */}
      <div className="language-selector">
        <label>🌍 Language:</label>
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          disabled={isListening}
          className="language-dropdown"
        >
          {languages.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* Microphone Level */}
      <div className="microphone-level-container">
        <div className="level-label">
          <span>🎤 Microphone Level</span>
          <span>{isListening ? `${microphoneLevel}%` : '—%'}</span>
        </div>
        <div className="level-bar-bg">
          <div 
            className="level-bar-fill"
            style={{ 
              width: isListening ? `${microphoneLevel}%` : '0%',
              backgroundColor: getLevelColor()
            }}
          />
        </div>
        {isListening && recognitionStatus && (
          <div className="recognition-status">
            <span className="status-dot"></span>
            {recognitionStatus}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="button-group">
        <button 
          onClick={startListening} 
          disabled={isListening}
          className="btn btn-start"
        >
          🎤 Start Listening
        </button>
        
        <button 
          onClick={stopListening} 
          disabled={!isListening}
          className="btn btn-stop"
        >
          ⏹️ Stop
        </button>
        
        <button 
          onClick={clearText}
          className="btn btn-clear"
        >
          🗑️ Clear
        </button>
      </div>

      <div className="status">
        Status: {isListening ? '🔴 Listening' : '⚪ Idle'}
        <span className="language-badge">
          {languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}
        </span>
      </div>

      {/* Transcript */}
      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">
          {transcript || 'Press "Start Listening" and speak...'}
        </div>
      </div>

      {/* Android Instructions */}
      <div className="info android-info">
        <p>📱 Android Instructions:</p>
        <ol>
          <li><strong>Tap Start Listening</strong> - Grant microphone permission when asked</li>
          <li><strong>Speak clearly</strong> - The app listens for one phrase at a time</li>
          <li><strong>After speaking</strong> - Recognition stops automatically (this is normal!)</li>
          <li><strong>For more speech</strong> - Tap Start Listening again</li>
          <li><strong>Check permission</strong> - Tap 🔒 in address bar → Microphone → Allow</li>
        </ol>
        <p className="note">Note: Chrome on Android stops listening after each phrase. Just press Start again to continue.</p>
      </div>
    </div>
  )
}

export default App