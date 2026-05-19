'use client'

import { useState, useCallback } from 'react'
import './Calculator.css'

const OP_MAP = {
  '+': 'add',
  '-': 'subtract',
  '×': 'multiply',
  '÷': 'divide',
}

export default function Calculator() {
  const [display, setDisplay] = useState('0')
  const [expression, setExpression] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const [pendingOp, setPendingOp] = useState(null)
  const [pendingValue, setPendingValue] = useState(null)

  const clear = useCallback(() => {
    setDisplay('0')
    setExpression('')
    setError(null)
    setWaitingForOperand(false)
    setPendingOp(null)
    setPendingValue(null)
  }, [])

  const inputDigit = useCallback((digit) => {
    setError(null)
    if (waitingForOperand) {
      setDisplay(digit)
      setWaitingForOperand(false)
    } else {
      setDisplay(display === '0' ? digit : display + digit)
    }
  }, [display, waitingForOperand])

  const inputDecimal = useCallback(() => {
    setError(null)
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
      return
    }
    if (!display.includes('.')) {
      setDisplay(display + '.')
    }
  }, [display, waitingForOperand])

  const backspace = useCallback(() => {
    setError(null)
    if (waitingForOperand) return
    if (display.length === 1 || (display.length === 2 && display.startsWith('-'))) {
      setDisplay('0')
    } else {
      setDisplay(display.slice(0, -1))
    }
  }, [display, waitingForOperand])

  const calculate = useCallback(async (operand1, operand2, operation) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:3001/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operand1, operand2, operation }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Calculation failed')
      }
      return data.result
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const handleOperator = useCallback(async (op) => {
    setError(null)
    const current = parseFloat(display)

    if (pendingOp && !waitingForOperand) {
      // Chain calculation
      const result = await calculate(pendingValue, current, OP_MAP[pendingOp])
      if (result !== null) {
        const resultStr = formatResult(result)
        setDisplay(resultStr)
        setExpression(`${resultStr} ${op}`)
        setPendingValue(result)
      } else {
        setExpression('')
        setPendingOp(null)
        setPendingValue(null)
        setWaitingForOperand(true)
        return
      }
    } else {
      setExpression(`${display} ${op}`)
      setPendingValue(current)
    }

    setPendingOp(op)
    setWaitingForOperand(true)
  }, [display, pendingOp, pendingValue, waitingForOperand, calculate])

  const handleEquals = useCallback(async () => {
    if (!pendingOp) return
    setError(null)

    const current = parseFloat(display)
    const result = await calculate(pendingValue, current, OP_MAP[pendingOp])

    if (result !== null) {
      const resultStr = formatResult(result)
      setDisplay(resultStr)
      setExpression(`${pendingValue} ${pendingOp} ${current} =`)
    }

    setPendingOp(null)
    setPendingValue(null)
    setWaitingForOperand(true)
  }, [display, pendingOp, pendingValue, calculate])

  const handleKeyDown = useCallback((e) => {
    // Handle keyboard input could be added here
  }, [])

  const buttons = [
    { label: 'C', type: 'clear', action: clear, wide: false },
    { label: '⌫', type: 'backspace', action: backspace, wide: false },
    { label: '÷', type: 'operator', action: () => handleOperator('÷'), wide: false },
    { label: '7', type: 'number', action: () => inputDigit('7') },
    { label: '8', type: 'number', action: () => inputDigit('8') },
    { label: '9', type: 'number', action: () => inputDigit('9') },
    { label: '×', type: 'operator', action: () => handleOperator('×') },
    { label: '4', type: 'number', action: () => inputDigit('4') },
    { label: '5', type: 'number', action: () => inputDigit('5') },
    { label: '6', type: 'number', action: () => inputDigit('6') },
    { label: '-', type: 'operator', action: () => handleOperator('-') },
    { label: '1', type: 'number', action: () => inputDigit('1') },
    { label: '2', type: 'number', action: () => inputDigit('2') },
    { label: '3', type: 'number', action: () => inputDigit('3') },
    { label: '+', type: 'operator', action: () => handleOperator('+') },
    { label: '0', type: 'number', action: () => inputDigit('0'), wide: true },
    { label: '.', type: 'number', action: inputDecimal },
    { label: '=', type: 'equals', action: handleEquals },
  ]

  return (
    <div className="calculator">
      <div className="display">
        <div className="expression">{expression || '\u00A0'}</div>
        <div className="value">{display}</div>
        {loading && <div className="loading-bar"><div className="loading-bar-inner" /></div>}
      </div>
      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠</span> {error}
        </div>
      )}
      <div className="keypad">
        {buttons.map((btn) => (
          <button
            key={btn.label}
            className={`btn btn-${btn.type}${btn.wide ? ' btn-wide' : ''}`}
            onClick={btn.action}
            disabled={loading}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatResult(num) {
  if (Number.isInteger(num)) return num.toString()
  const str = num.toPrecision(12)
  return parseFloat(str).toString()
}
