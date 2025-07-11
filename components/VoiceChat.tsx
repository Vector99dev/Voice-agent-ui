'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Send, Home, Building, User } from 'lucide-react'
import { Room, RoomEvent, RemoteParticipant, LocalParticipant } from 'livekit-client'
import ReactMarkdown from 'react-markdown'

interface Message {
  id: string
  text: string
  sender: 'user' | 'agent'
  timestamp: Date
}

interface Property {
  id: string
  title: string
  type: string
  location: string
  price: string
  features: string[]
  image: string
}

export default function VoiceChat() {
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [properties, setProperties] = useState<Property[]>([])
  const [conversationStage, setConversationStage] = useState<'needs' | 'properties' | 'details' | 'contact'>('needs')
  const [isLoading, setIsLoading] = useState(false)
  const [messageCounter, setMessageCounter] = useState(0)
  
  const roomRef = useRef<Room | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hasShownInitialMessageRef = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Mock property data
  const mockProperties: Property[] = [
    {
      id: '1',
      title: 'Modern Downtown Apartment',
      type: 'Apartment',
      location: 'Shinagawa, Tokyo',
      price: '¥85,000,000',
      features: ['3 Bedrooms', 'Floor-to-ceiling windows', 'City views', 'Walking distance to station'],
      image: '/api/placeholder/400/300'
    },
    {
      id: '2',
      title: 'Luxury Townhouse',
      type: 'Townhouse',
      location: 'Shibuya, Tokyo',
      price: '¥120,000,000',
      features: ['4 Bedrooms', 'Private garden', 'Parking', 'High-end finishes'],
      image: '/api/placeholder/400/300'
    },
    {
      id: '3',
      title: 'City Loft',
      type: 'Loft',
      location: 'Minato, Tokyo',
      price: '¥95,000,000',
      features: ['2 Bedrooms', 'Open concept', 'Industrial design', 'Rooftop terrace'],
      image: '/api/placeholder/400/300'
    }
  ]

  useEffect(() => {
    // Initialize LiveKit room
    const initRoom = async () => {
      try {
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        })

        // Connect to LiveKit server (replace with your LiveKit server URL)
        await room.connect('wss://your-livekit-server.com', 'your-token')
        
        roomRef.current = room
        setIsConnected(true)

        // Listen for audio from agent
        room.on(RoomEvent.AudioPlaybackStatusChanged, (playing) => {
          setIsAgentSpeaking(playing)
        })

      } catch (error) {
        console.error('Failed to connect to LiveKit:', error)
        // For demo purposes, simulate connection
        setIsConnected(true)
      }
      
      // Add initial agent message only once
      if (!hasShownInitialMessageRef.current) {
        addMessage('Hello! I\'m your AI real estate assistant. What kind of property are you looking for today?', 'agent')
        hasShownInitialMessageRef.current = true
      }
    }

    initRoom()

    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const addMessage = (text: string, sender: 'user' | 'agent') => {
    setMessageCounter(prev => prev + 1)
    const newId = (messageCounter + 1).toString()
    const newMessage: Message = {
      id: newId,
      text,
      sender,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, newMessage])
    return newId
  }

  const callChatAPIStream = async (message: string, onChunk: (chunk: string) => void): Promise<void> => {
    const response = await fetch('http://localhost:8000/chat/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    })
    if (!response.body) {
      onChunk('Sorry, I encountered an error. Please try again.')
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let done = false
    while (!done) {
      const { value, done: doneReading } = await reader.read()
      done = doneReading
      if (value) {
        onChunk(decoder.decode(value))
      }
    }
  }

  const handleAgentResponse = async (userInput: string) => {
    setIsLoading(true)
    setIsAgentSpeaking(false)
    let streamedText = ''
    setMessageCounter(prev => prev + 1)
    const agentMessageId = (messageCounter + 2).toString()
    setMessages(prev => [...prev, { id: agentMessageId, text: '', sender: 'agent', timestamp: new Date() }])
    try {
      await callChatAPIStream(userInput, (chunk) => {
        streamedText += chunk
        setMessages(prev => prev.map(m => m.id === agentMessageId ? { ...m, text: streamedText } : m))
      })
      // Update conversation stage based on response content
      if (streamedText.toLowerCase().includes('property') || streamedText.toLowerCase().includes('found')) {
        setProperties(mockProperties)
        setConversationStage('properties')
      }
    } catch (error) {
      console.error('Error getting agent response:', error)
      setMessages(prev => prev.map(m => m.id === agentMessageId ? { ...m, text: 'Sorry, I encountered an error. Please try again.' } : m))
    } finally {
      setIsLoading(false)
      setIsAgentSpeaking(false)
    }
  }

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isLoading) return
    
    const userMessage = currentInput.trim()
    // Only add the user's message as 'user' with a unique id
    const userMessageId = addMessage(userMessage, 'user')
    setCurrentInput('')
    
    // Call backend API for response (this will only add/update an 'agent' message)
    await handleAgentResponse(userMessage)
  }

  const selectProperty = (property: Property) => {
    const response = `Great choice! Let me tell you more about the ${property.title}. This ${property.type.toLowerCase()} is located in ${property.location} and is priced at ${property.price}. It features ${property.features.join(', ')}. Would you like to know more about this property?`
    addMessage(response, 'agent')
    setConversationStage('details')
  }

  const renderMessageContent = (text: string, sender: 'user' | 'agent') => {
    if (sender === 'agent') {
      return (
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>
            {text}
          </ReactMarkdown>
        </div>
      )
    }
    
    return <p className="text-sm">{text}</p>
  }

  const startListening = async () => {
    if (!isConnected) return;

    setIsListening(true);

    // Simulate speech recognition
    setTimeout(() => {
      const mockUserInput = "I'm looking for a 3-bedroom apartment in Tokyo with a budget around 100 million yen";
      setCurrentInput(mockUserInput);
      addMessage(mockUserInput, 'user');
      setIsListening(false);

      // Clear the input after adding the message
      setCurrentInput('');

      // Call backend API for response
      setTimeout(() => {
        handleAgentResponse(mockUserInput);
      }, 1000);
    }, 2000);
  };

  const stopListening = () => {
    setIsListening(false);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side - Agent Messages */}
        <div className="bg-white rounded-lg shadow-lg p-6 h-[600px] flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">AI Real Estate Agent</h3>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isAgentSpeaking ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-sm text-gray-500">
                  {(() => {
                    const lastAgentMsg = [...messages].reverse().find(m => m.sender === 'agent');
                    if (isLoading) {
                      if (lastAgentMsg && lastAgentMsg.text && lastAgentMsg.text.length > 0) {
                        return 'Speaking...';
                      } else {
                        return 'Thinking...';
                      }
                    }
                    if (isAgentSpeaking) return 'Speaking...';
                    return 'Ready';
                  })()}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg ${
                    message.sender === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {message.sender === 'agent' && message.text === '' ? (
                    <div className="flex items-center justify-center h-6">
                      <span className="dot-flashing">
                        <span></span><span></span><span></span>
                      </span>
                    </div>
                  ) : (
                    renderMessageContent(message.text, message.sender)
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Right Side - User Input & Properties */}
        <div className="space-y-6">
          {/* Voice Control */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Voice Control</h3>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-gray-500">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={isListening ? stopListening : startListening}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">
                  {isListening ? 'Listening...' : 'Click to speak'}
                </p>
                <div className="flex items-center gap-1 justify-center">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`w-1 h-4 bg-gray-300 rounded ${
                        isListening ? 'voice-wave' : ''
                      }`}
                      style={{ animationDelay: `${i * 0.1}s` }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Text Input */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Text Input</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder="Type your message here..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isLoading}
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || !currentInput.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Properties Display */}
          {properties.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="font-semibold text-gray-800 mb-4">Available Properties</h3>
              <div className="space-y-4">
                {properties.map((property) => (
                  <div
                    key={property.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors cursor-pointer"
                    onClick={() => selectProperty(property)}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-20 h-20 bg-gray-200 rounded-lg flex items-center justify-center">
                        <Building className="w-8 h-8 text-gray-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800">{property.title}</h4>
                        <p className="text-sm text-gray-600">{property.type} • {property.location}</p>
                        <p className="text-lg font-bold text-blue-600 mt-1">{property.price}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {property.features.slice(0, 2).map((feature, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 