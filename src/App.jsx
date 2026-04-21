import React, { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)

  // Language options
  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Spanish' },
    { code: 'fr-FR', name: 'French' },
    { code: 'de-DE', name: 'German' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'pt-PT', name: 'Portuguese' },
    { code: 'ru-RU', name: 'Russian' },
    { code: 'ja-JP', name: 'Japanese' },
    { code: 'ko-KR', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'ar-EG', name: 'Arabic' },
    { code: 'hi-IN', name: 'Hindi' },
    { code: 'nl-NL', name: 'Dutch' },
    { code: 'pl-PL', name: 'Polish' },
    { code: 'tr-TR', name: 'Turkish' },
  ]

  // Update microphone level visualization
  const updateMicrophoneLevel = () => {
    if (!analyserNodeRef.current) return
    
    const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount)
    analyserNodeRef.current.getByteTimeDomainData(dataArray)
    
    // Calculate average volume level
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128
      sum += v * v
    }
    let average = Math.sqrt(sum / dataArray.length) || 0
    // Scale and smooth the level
    const level = Math.min(100, Math.floor(average * 200))
    setMicrophoneLevel(level)
    
    animationFrameRef.current = requestAnimationFrame(updateMicrophoneLevel)
  }

  // Start microphone for level visualization
  const startMicrophoneVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserNodeRef.current = audioContextRef.current.createAnalyser()
      analyserNodeRef.current.fftSize = 256
      
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(stream)
      sourceNodeRef.current.connect(analyserNodeRef.current)
      
      // Start audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      updateMicrophoneLevel()
    } catch (err) {
      console.error('Could not access microphone for visualization:', err)
    }
  }

  // Stop microphone visualization
  const stopMicrophoneVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
    }
    if (analyserNodeRef.current) {
      analyserNodeRef.current.disconnect()
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    setMicrophoneLevel(0)
  }

  useEffect(() => {
    // Check if browser supports speech recognition
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.')
      return
    }

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = true
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = selectedLanguage

    // Handle recognition results
    recognitionRef.current.onresult = (event) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart + ' '
        } else {
          interimTranscript += transcriptPart
        }
      }

      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript)
      } else if (interimTranscript) {
        setTranscript(prev => prev + interimTranscript)
      }
    }

    // Handle errors
    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      let errorMessage = ''
      switch (event.error) {
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.'
          break
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.'
          break
        case 'audio-capture':
          errorMessage = 'No microphone found. Please connect a microphone.'
          break
        case 'network':
          errorMessage = 'Network error occurred. Please check your connection.'
          break
        default:
          errorMessage = `Error: ${event.error}`
      }
      setError(errorMessage)
      setIsListening(false)
      stopMicrophoneVisualization()
    }

    recognitionRef.current.onend = () => {
      setIsListening(false)
      stopMicrophoneVisualization()
    }

    recognitionRef.current.onstart = () => {
      startMicrophoneVisualization()
    }

    // Cleanup on component unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      stopMicrophoneVisualization()
    }
  }, [selectedLanguage]) // Re-initialize when language changes

  const startListening = async () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported')
      return
    }

    setError('')
    setTranscript('')
    
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })
      recognitionRef.current.start()
      setIsListening(true)
    } catch (err) {
      setError('Microphone access denied. Please allow microphone access and try again.')
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      stopMicrophoneVisualization()
    }
  }

  const clearText = () => {
    setTranscript('')
  }

  const handleLanguageChange = (event) => {
    const newLanguage = event.target.value
    setSelectedLanguage(newLanguage)
    // If currently listening, restart with new language
    if (isListening) {
      stopListening()
      setTimeout(() => {
        startListening()
      }, 100)
    }
  }

  // Get color for microphone level bar
  const getLevelColor = () => {
    if (microphoneLevel < 30) return 'var(--level-low)'
    if (microphoneLevel < 70) return 'var(--level-medium)'
    return 'var(--level-high)'
  }

  return (
    <div className="container">
      <h1>🎙️ Voice Recognition App</h1>
      <p className="subtitle">Speak into your microphone and see the text appear</p>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      {/* Language Selection Dropdown */}
      <div className="language-selector">
        <label htmlFor="language">🌍 Recognition Language:</label>
        <select
          id="language"
          value={selectedLanguage}
          onChange={handleLanguageChange}
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

      {/* Microphone Level Bar */}
      {isListening && (
        <div className="microphone-level-container">
          <div className="level-label">
            <span>🎤 Microphone Level</span>
            <span className="level-percentage">{microphoneLevel}%</span>
          </div>
          <div className="level-bar-bg">
            <div 
              className="level-bar-fill"
              style={{ 
                width: `${microphoneLevel}%`,
                backgroundColor: getLevelColor(),
                transition: 'width 0.05s linear'
              }}
            />
          </div>
          <div className="level-tips">
            <span>🔇 Quiet</span>
            <span>🎙️ Normal</span>
            <span>📢 Loud</span>
          </div>
        </div>
      )}

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
          ⏹️ Stop Listening
        </button>
        
        <button 
          onClick={clearText}
          className="btn btn-clear"
        >
          🗑️ Clear Text
        </button>
      </div>

      <div className="status">
        Status: {isListening ? '🔴 Listening...' : '⚪ Idle'}
        {isListening && selectedLanguage && (
          <span className="language-badge"> 🗣️ {languages.find(l => l.code === selectedLanguage)?.name}</span>
        )}
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">
          {transcript || 'Click "Start Listening" and speak into your microphone...'}
        </div>
      </div>

      <div className="info">
        <p>💡 Tips:</p>
        <ul>
          <li>Make sure your microphone is connected and allowed</li>
          <li>Speak clearly and at a normal pace</li>
          <li>The microphone level bar shows your input volume in real-time</li>
          <li>Change language anytime - recognition will adapt automatically</li>
          <li>Works best in Chrome, Edge, or Safari</li>
        </ul>
      </div>
    </div>
  )
}

export default App