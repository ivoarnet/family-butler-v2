import Foundation

struct Household: Decodable, Identifiable {
    let id: UUID
    let name: String
}

struct HouseholdList: Decodable {
    let households: [Household]
}

struct HouseholdCalendar: Decodable {
    let events: [CalendarEvent]
}

struct CalendarEvent: Decodable, Identifiable {
    let id: UUID
    let title: String
    let date: String
    let allDay: Bool
    let startTime: String?
    let endTime: String?
    let location: String?
    let repeatRule: String?

    func start(calendar: Calendar = .current) -> Date? {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let time = (allDay ? "00:00" : startTime ?? "").split(separator: ":").compactMap { Int($0) }
        guard time.count >= 2 else { return nil }
        return calendar.date(from: DateComponents(
            year: parts[0], month: parts[1], day: parts[2], hour: time[0], minute: time[1]
        ))
    }

    static func upcoming(_ events: [CalendarEvent], now: Date = Date(), calendar: Calendar = .current) -> [CalendarEvent] {
        let today = calendar.startOfDay(for: now)
        guard let end = calendar.date(byAdding: .day, value: 30, to: today) else { return [] }
        return events.filter {
            guard let start = $0.start(calendar: calendar) else { return false }
            return start >= ($0.allDay ? today : now) && start < end
        }.sorted {
            ($0.start(calendar: calendar) ?? .distantFuture, $0.title) <
            ($1.start(calendar: calendar) ?? .distantFuture, $1.title)
        }
    }
}

struct AuthConfiguration: Decodable {
    let supabaseUrl: String
    let supabasePublishableKey: String
    let isConfigured: Bool

    func validatedURL() throws -> URL {
        let url = try APIClient.httpsURL(supabaseUrl)
        let key = supabasePublishableKey
        if key.hasPrefix("sb_publishable_") { return url }
        // Legacy public anon JWTs are supported, but service-role/secret keys are never accepted.
        let parts = key.split(separator: ".")
        guard parts.count == 3 else { throw ClientError.configuration }
        var payload = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard let data = Data(base64Encoded: payload),
              let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              claims["role"] as? String == "anon" else { throw ClientError.configuration }
        return url
    }
}

struct Session: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: TimeInterval
    var expiresAt: Date { receivedAt.addingTimeInterval(expiresIn) }
    private var receivedAt = Date()

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
    }
}

enum ClientError: Error {
    case configuration, expired, denied, network

    var message: String {
        switch self {
        case .configuration: return "Configure the HTTPS API address and public authentication settings."
        case .expired: return "Sign-in failed or the session expired. Please sign in again."
        case .denied: return "This household is no longer available. Choose another household."
        case .network: return "Unable to connect. Please try again."
        }
    }
}
