package ru.herofit.app.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class NotificationsTest {
    @Test
    fun channels() {
        assertEquals("rest", channelFor("REST"))
        listOf("STREAK", "PLAN", "RECAP", "COMEBACK", "GOAL").forEach { assertEquals("reminders", channelFor(it)) }
        listOf("ACHIEVEMENT", "BOSS", "RAID").forEach { assertEquals("game", channelFor(it)) }
        assertEquals("social", channelFor("SOCIAL"))
        assertEquals("coach", channelFor("COACH"))
        listOf("SYSTEM", "FEEDBACK", "NEW_TYPE", null).forEach { assertEquals("system", channelFor(it)) }
    }

    @Test
    fun sameTagSameId() {
        assertEquals(notificationId("hero-fit-rest"), notificationId("hero-fit-rest"))
        assertNotEquals(notificationId("hero-fit-rest"), notificationId("hero-fit-streak"))
    }

    @Test
    fun safePathOnlyOwnPaths() {
        assertEquals("/workouts/abc?x=1", safePath("/workouts/abc?x=1"))
        listOf(null, "", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "workouts")
            .forEach { assertEquals("/dashboard", safePath(it)) }
    }
}
