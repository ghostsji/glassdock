package dev.canvas.launcher.system

import java.math.BigDecimal
import java.math.MathContext
import kotlin.math.pow

/** A tiny, safe expression evaluator for the search bar: + − × ÷ ^ % ( ) and decimals. */
object Calculator {

    fun looksLikeMath(q: String): Boolean {
        val s = q.replace(" ", "")
        return s.length >= 3 && s.any { it.isDigit() } && s.any { it in "+-*/x×÷^%" } &&
            s.all { it.isDigit() || it in "+-*/x×÷^%().," }
    }

    fun evaluate(q: String): String? = runCatching {
        val v = Parser(q.replace("×", "*").replace("x", "*").replace("÷", "/").replace(",", ".").replace(" ", "")).parse()
        if (v.isNaN() || v.isInfinite()) null else format(v)
    }.getOrNull()

    private fun format(v: Double): String {
        val bd = BigDecimal(v, MathContext(12)).stripTrailingZeros()
        return if (bd.scale() <= 0) bd.toBigInteger().toString() else bd.toPlainString()
    }

    private class Parser(val s: String) {
        var i = 0
        fun parse(): Double { val v = expr(); require(i == s.length); return v }
        fun expr(): Double {
            var v = term()
            while (i < s.length) when (s[i]) {
                '+' -> { i++; v += term() }
                '-' -> { i++; v -= term() }
                else -> return v
            }
            return v
        }
        fun term(): Double {
            var v = power()
            while (i < s.length) when (s[i]) {
                '*' -> { i++; v *= power() }
                '/' -> { i++; v /= power() }
                '%' -> { i++; v = if (i < s.length && (s[i].isDigit() || s[i] == '(')) v % power() else v / 100 }
                else -> return v
            }
            return v
        }
        fun power(): Double {
            val base = unary()
            if (i < s.length && s[i] == '^') { i++; return base.pow(power()) }
            return base
        }
        fun unary(): Double {
            if (i < s.length && s[i] == '-') { i++; return -unary() }
            if (i < s.length && s[i] == '+') { i++; return unary() }
            return atom()
        }
        fun atom(): Double {
            if (i < s.length && s[i] == '(') {
                i++; val v = expr(); require(i < s.length && s[i] == ')'); i++; return v
            }
            val start = i
            while (i < s.length && (s[i].isDigit() || s[i] == '.')) i++
            require(i > start)
            return s.substring(start, i).toDouble()
        }
    }
}
