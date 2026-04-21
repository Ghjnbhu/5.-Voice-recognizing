import React, { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState('')
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [recognitionStatus, setRecognitionStatus] = useState('')
  const recognitionRef = useRef(null)
  const audioContextRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const animationFrameRef = useRef(null)
  const restartTimeoutRef = useRef(null)

  // Language options
  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Español (Spanish)' },
    { code: 'fr-FR', name: 'Français (French)' },
    { code: 'de-DE', name: 'Deutsch (German)' },
    { code: 'it-IT', name: 'Italiano (Italian)' },
    { code: 'pt-PT', name: 'Português (Portuguese)' },
    { code: 'pt-BR', name: 'Português (Brazil)' },
    { code: 'ru-RU', name: 'Русский (Russian)' },
    { code: 'ja-JP', name: '日本語 (Japanese)' },
    { code: 'ko-KR', name: '한국어 (Korean)' },
    { code: 'zh-CN', name: '中文 (Chinese Simplified)' },
    { code: 'zh-TW', name: '中文 (Chinese Traditional)' },
    { code: 'ar-EG', name: 'العربية (Arabic)' },
    { code: 'hi-IN', name: 'हिन्दी (Hindi)' },
    { code: 'nl-NL', name: 'Nederlands (Dutch)' },
    { code: 'pl-PL', name: 'Polski (Polish)' },
    { code: 'tr-TR', name: 'Türkçe (Turkish)' },
  ]

  // Update microphone level visualization
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
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      updateMicrophoneLevel()
    } catch (err) {
      console.error('Could not access microphone for visualization:', err)
    }
  }

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

  // Initialize speech recognition
  const initRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser')
      return null
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = selectedLanguage
    recognition.maxAlternatives = 1

    // Handle results
    recognition.onresult = (event) => {
      console.log('Results received:', event.results)
      let currentInterim = ''
      let currentFinal = ''

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const transcriptText = result[0].transcript
        
        if (result.isFinal) {
          currentFinal += transcriptText + ' '
          console.log('Final:', transcriptText)
        } else {
          currentInterim += transcriptText
          console.log('Interim:', transcriptText)
        }
      }

      if (currentFinal) {
        setTranscript(prev => prev + currentFinal)
        setInterimTranscript('')
      } else if (currentInterim) {
        setInterimTranscript(currentInterim)
      }
    }

    // Handle start
    recognition.onstart = () => {
      console.log('Recognition started')
      setRecognitionStatus('Listening for speech...')
      setError('')
      startMicrophoneVisualization()
    }

    // Handle end
    recognition.onend = () => {
      console.log('Recognition ended')
      if (isListening) {
        // Auto-restart if we were supposed to be listening
        setRecognitionStatus('Restarting...')
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
        restartTimeoutRef.current = setTimeout(() => {
          if (isListening) {
            try {
              recognition.start()
            } catch (e) {
              console.error('Failed to restart:', e)
              setIsListening(false)
              setRecognitionStatus('Stopped')
            }
          }
        }, 100)
      } else {
        setRecognitionStatus('Stopped')
        stopMicrophoneVisualization()
      }
    }

    // Handle errors
    recognition.onerror = (event) => {
      console.error('Recognition error:', event.error)
      let errorMessage = ''
      
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please speak into the microphone.'
          setRecognitionStatus('No speech detected - try speaking louder')
          break
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your connection.'
          setRecognitionStatus('Microphone error')
          break
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow access.'
          setRecognitionStatus('Permission denied')
          break
        case 'network':
          errorMessage = 'Network error. Please check your connection.'
          setRecognitionStatus('Network error')
          break
        case 'aborted':
          errorMessage = 'Recognition was aborted.'
          setRecognitionStatus('Aborted')
          break
        case 'language-not-supported':
          errorMessage = `Language ${selectedLanguage} may not be fully supported.`
          setRecognitionStatus('Language not fully supported')
          break
        default:
          errorMessage = `Error: ${event.error}`
          setRecognitionStatus('Error occurred')
      }
      
      if (errorMessage) setError(errorMessage)
    }

    // Handle sound start
    recognition.onsoundstart = () => {
      console.log('Sound detected')
      setRecognitionStatus('Sound detected - processing speech...')
    }

    // Handle sound end
    recognition.onsoundend = () => {
      console.log('Sound ended')
      setRecognitionStatus('Waiting for speech...')
    }

    // Handle speech start
    recognition.onspeechstart = () => {
      console.log('Speech started')
      setRecognitionStatus('Speech detected - transcribing...')
    }

    // Handle speech end
    recognition.onspeechend = () => {
      console.log('Speech ended')
      setRecognitionStatus('Processing...')
    }

    return recognition
  }

  useEffect(() => {
    // Check browser support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.')
      return
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Your browser does not support microphone access.')
      return
    }

    // Cleanup on unmount
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {}
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      stopMicrophoneVisualization()
    }
  }, [])

  // Re-initialize when language changes
  useEffect(() => {
    if (recognitionRef.current) {
      const wasListening = isListening
      if (wasListening) {
        stopListening()
        setTimeout(() => {
          recognitionRef.current = initRecognition()
          if (wasListening) startListening()
        }, 200)
      } else {
        recognitionRef.current = initRecognition()
      }
    } else {
      recognitionRef.current = initRecognition()
    }
  }, [selectedLanguage])

  const startListening = async () => {
    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition()
    }

    setError('')
    setTranscript('')
    setInterimTranscript('')
    setIsListening(true)
    
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })
      recognitionRef.current.start()
    } catch (err) {
      console.error('Microphone permission error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please click the microphone icon in your browser address bar and allow access.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone to your computer.')
      } else {
        setError(`Cannot access microphone: ${err.message}`)
      }
      setIsListening(false)
    }
  }

  const stopListening = () => {
    setIsListening(false)
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.error('Error stopping recognition:', e)
      }
    }
    stopMicrophoneVisualization()
    setRecognitionStatus('Stopped')
  }

  const clearText = () => {
    setTranscript('')
    setInterimTranscript('')
  }

  const handleLanguageChange = (event) => {
    setSelectedLanguage(event.target.value)
  }

  const getLevelColor = () => {
    if (microphoneLevel < 20) return 'var(--level-low)'
    if (microphoneLevel < 50) return 'var(--level-medium-low)'
    if (microphoneLevel < 80) return 'var(--level-medium)'
    return 'var(--level-high)'
  }

  // Display text (interim + final)
  const displayText = transcript + (interimTranscript ? (transcript ? ' ' : '') + interimTranscript : '')

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
      <div className={`microphone-level-container ${isListening ? 'active' : 'inactive'}`}>
        <div className="level-label">
          <span>🎤 Microphone Level</span>
          <span className="level-percentage">
            {isListening ? `${microphoneLevel}%` : '—%'}
          </span>
        </div>
        <div className="level-bar-bg">
          <div 
            className="level-bar-fill"
            style={{ 
              width: isListening ? `${microphoneLevel}%` : '0%',
              backgroundColor: getLevelColor(),
              transition: 'width 0.05s linear'
            }}
          />
        </div>
        {isListening && (
          <div className="recognition-status">
            <span className="status-dot"></span>
            {recognitionStatus || 'Listening...'}
          </div>
        )}
      </div>

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
        <span className="status-icon">{isListening ? '🔴' : '⚪'}</span>
        Status: {isListening ? 'Listening...' : 'Idle'}
        {selectedLanguage && (
          <span className="language-badge">
            🗣️ {languages.find(l => l.code === selectedLanguage)?.name || selectedLanguage}
          </span>
        )}
      </div>

      <div className="transcript-container">
        <h3>Recognized Text:</h3>
        <div className="transcript-box">
          {displayText || 'Click "Start Listening" and speak into your microphone...'}
        </div>
      </div>

      <div className="info">
        <p>💡 Troubleshooting Tips:</p>
        <ul>
          <li><strong>Microphone level bar moves?</strong> ✓ Good - your mic is working!</li>
          <li><strong>No text appearing?</strong> Try these fixes:</li>
          <ul>
            <li>Speak louder and more clearly</li>
            <li>Check if your microphone isn't muted in Windows</li>
            <li>Try a different language (some work better than others)</li>
            <li>Close and reopen the browser tab</li>
            <li>Try Chrome browser if using Edge</li>
          </ul>
          <li><strong>Test your microphone:</strong> <a href="https://webmictest.com/" target="_blank" rel="noopener noreferrer">webmictest.com</a></li>
          <li>Works best in Chrome browser</li>
        </ul>
      </div>
    </div>
  )
}

export default App