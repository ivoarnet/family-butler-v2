import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import FamilyButler

final class ClientTests: XCTestCase {
    func testHTTPSOnlyConfiguration() throws {
        for address in ["http://api.example.com", "https://" + "user:password@" + "api.example.com",
                        "https://api.example.com?token=test", "https://api.example.com/#fragment",
                        "https://example.invalid", "https://api.example.com/api"] {
            XCTAssertThrowsError(try APIClient.httpsURL(address))
        }
        XCTAssertEqual(try APIClient.httpsURL("https://api.example.com").host, "api.example.com")
    }

    func testSecretKeysAreRejected() throws {
        for key in ["sb_secret_not-a-real-key", "invalid", legacyKey(role: "service_role")] {
            let config = AuthConfiguration(supabaseUrl: "https://auth.example.com", supabasePublishableKey: key, isConfigured: true)
            XCTAssertThrowsError(try config.validatedURL())
        }
        let config = AuthConfiguration(supabaseUrl: "https://auth.example.com",
                                       supabasePublishableKey: legacyKey(role: "anon"), isConfigured: true)
        XCTAssertNoThrow(try config.validatedURL())
    }

    func testUpcomingEventsAreFilteredAndSorted() throws {
        let calendar = Calendar(identifier: .gregorian)
        let now = calendar.date(from: DateComponents(year: 2026, month: 10, day: 2, hour: 12))!
        let events = try JSONDecoder().decode([CalendarEvent].self, from: Data("""
        [
          {"id":"00000000-0000-0000-0000-000000000001","title":"Tomorrow","date":"2026-10-03","allDay":false,"startTime":"09:00"},
          {"id":"00000000-0000-0000-0000-000000000002","title":"All day today","date":"2026-10-02","allDay":true},
          {"id":"00000000-0000-0000-0000-000000000003","title":"Past","date":"2026-10-02","allDay":false,"startTime":"10:00"},
          {"id":"00000000-0000-0000-0000-000000000004","title":"Beyond window","date":"2026-11-01","allDay":true}
        ]
        """.utf8))
        XCTAssertEqual(CalendarEvent.upcoming(events, now: now, calendar: calendar).map(\.title), ["All day today", "Tomorrow"])
    }

    func testSessionDecodesSupabaseContract() throws {
        let before = Date()
        let session = try JSONDecoder().decode(Session.self, from: sessionData)
        XCTAssertEqual(session.accessToken, "test-access")
        XCTAssertEqual(session.refreshToken, "test-refresh")
        XCTAssertGreaterThanOrEqual(session.expiresAt, before.addingTimeInterval(3600))
    }

    func testHouseholdRequestsUseUserToken() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/api/households")
            XCTAssertEqual(request.value(forHTTPHeaderField: "x-supabase-auth-token"), "test-access")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), ["Bearer", "test-access"].joined(separator: " "))
            return (200, Data(#"{"households":[{"id":"00000000-0000-0000-0000-000000000001","name":"Home"}]}"#.utf8))
        }
        let households = try await client.households(JSONDecoder().decode(Session.self, from: sessionData))
        XCTAssertEqual(households.map(\.name), ["Home"])
    }

    func testInvalidSessionIsRejected() async throws {
        let client = makeClient { _ in (401, Data("private server error".utf8)) }
        do {
            _ = try await client.households(JSONDecoder().decode(Session.self, from: sessionData))
            XCTFail("Invalid sessions must not return household data")
        } catch ClientError.expired {
        }
    }

    func testUnauthorizedHouseholdIsRejected() async throws {
        let client = makeClient { _ in (404, Data()) }
        do {
            _ = try await client.events(Household(id: UUID(), name: "Other"), session: JSONDecoder().decode(Session.self, from: sessionData))
            XCTFail("Denied households must not return events")
        } catch ClientError.denied {
        }
    }

    func testRefreshUsesRefreshGrant() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/auth/v1/token")
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.query, "grant_type=refresh_token")
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "sb_publishable_test")
            return (200, self.sessionData)
        }
        let session = try await client.refresh(JSONDecoder().decode(Session.self, from: sessionData), config: configuration)
        XCTAssertEqual(session.refreshToken, "test-refresh")
    }

    func testSignOutRevokesOnlyCurrentSession() async throws {
        let client = makeClient { request in
            XCTAssertEqual(request.url?.path, "/auth/v1/logout")
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.query, "scope=local")
            XCTAssertEqual(request.httpMethod, "POST")
            return (204, Data())
        }
        try await client.signOut(JSONDecoder().decode(Session.self, from: sessionData), config: configuration)
    }

    #if canImport(SwiftUI)
    @MainActor
    func testSignInAndSignOutClearPrivateState() async {
        let client = makeClient { request in
            switch request.url?.path {
            case "/api/auth-config":
                return (200, Data(#"{"supabaseUrl":"https://auth.example.com","supabasePublishableKey":"sb_publishable_test","isConfigured":true}"#.utf8))
            case "/auth/v1/token": return (200, self.sessionData)
            case "/api/households":
                return (200, Data(#"{"households":[{"id":"00000000-0000-0000-0000-000000000001","name":"Home"}]}"#.utf8))
            default: return (204, Data())
            }
        }
        let model = AppModel(api: client)
        await model.signIn(email: "test@example.com", password: "test-only")
        XCTAssertTrue(model.signedIn)
        XCTAssertEqual(model.households.map(\.name), ["Home"])
        model.signOut()
        XCTAssertFalse(model.signedIn)
        XCTAssertTrue(model.households.isEmpty)
        XCTAssertTrue(model.events.isEmpty)
        XCTAssertNil(model.selected)
        XCTAssertFalse(model.busy)
    }

    @MainActor
    func testInvalidLoginNeverDisplaysHouseholds() async {
        let client = makeClient { request in
            if request.url?.path == "/api/auth-config" {
                return (200, Data(#"{"supabaseUrl":"https://auth.example.com","supabasePublishableKey":"sb_publishable_test","isConfigured":true}"#.utf8))
            }
            return (400, Data())
        }
        let model = AppModel(api: client)
        await model.signIn(email: "test@example.com", password: "test-only")
        XCTAssertFalse(model.signedIn)
        XCTAssertTrue(model.households.isEmpty)
        XCTAssertEqual(model.message, ClientError.expired.message)
    }
    #endif

    private var sessionData: Data {
        Data(#"{"access_token":"test-access","refresh_token":"test-refresh","expires_in":3600}"#.utf8)
    }

    private var configuration: AuthConfiguration {
        AuthConfiguration(supabaseUrl: "https://auth.example.com", supabasePublishableKey: "sb_publishable_test", isConfigured: true)
    }

    private func legacyKey(role: String) -> String {
        let payload = Data("{\"role\":\"\(role)\"}".utf8).base64EncodedString()
            .replacingOccurrences(of: "=", with: "")
        return "test.\(payload).test"
    }

    private func makeClient(_ handler: @escaping (URLRequest) throws -> (Int, Data)) -> APIClient {
        StubProtocol.handler = handler
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        return APIClient(baseURL: URL(string: "https://api.example.com")!, configuration: config)
    }
}

private final class StubProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let (status, data) = try Self.handler!(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
