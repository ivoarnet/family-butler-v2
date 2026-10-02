import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class APIClient: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let baseURL: URL
    private var transport: URLSession!

    init(baseURL: URL, configuration: URLSessionConfiguration = .ephemeral) {
        self.baseURL = baseURL
        super.init()
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20
        transport = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }

    static func httpsURL(_ value: String) throws -> URL {
        guard let url = URL(string: value), url.scheme == "https",
              let host = url.host, !host.isEmpty, host != "example.invalid",
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty || url.path == "/" else { throw ClientError.configuration }
        return url
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func authConfiguration() async throws -> AuthConfiguration {
        let config: AuthConfiguration = try await request(baseURL.appendingPathComponent("api/auth-config"))
        guard config.isConfigured else { throw ClientError.configuration }
        _ = try config.validatedURL()
        return config
    }

    func signIn(email: String, password: String, config: AuthConfiguration) async throws -> Session {
        try await authenticate(config: config, grant: "password", body: ["email": email, "password": password])
    }

    func refresh(_ session: Session, config: AuthConfiguration) async throws -> Session {
        try await authenticate(config: config, grant: "refresh_token", body: ["refresh_token": session.refreshToken])
    }

    private func authenticate(config: AuthConfiguration, grant: String, body: [String: String]) async throws -> Session {
        let root = try config.validatedURL()
        var url = URLComponents(url: root.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "grant_type", value: grant)]
        return try await request(url.url!, method: "POST",
                                 headers: ["apikey": config.supabasePublishableKey], body: body, authentication: true)
    }

    func signOut(_ session: Session, config: AuthConfiguration) async throws {
        let root = try config.validatedURL()
        var url = URLComponents(url: root.appendingPathComponent("auth/v1/logout"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "scope", value: "local")]
        _ = try await send(url.url!, method: "POST", headers: [
            "apikey": config.supabasePublishableKey, "Authorization": ["Bearer", session.accessToken].joined(separator: " ")
        ])
    }

    func households(_ session: Session) async throws -> [Household] {
        let list: HouseholdList = try await request(baseURL.appendingPathComponent("api/households"), headers: apiHeaders(session))
        return list.households
    }

    func events(_ household: Household, session: Session) async throws -> [CalendarEvent] {
        let result: HouseholdCalendar = try await request(
            baseURL.appendingPathComponent("api/households/\(household.id.uuidString)"), headers: apiHeaders(session)
        )
        return result.events
    }

    private func apiHeaders(_ session: Session) -> [String: String] {
        ["Authorization": ["Bearer", session.accessToken].joined(separator: " "), "x-supabase-auth-token": session.accessToken]
    }

    private func request<T: Decodable>(_ url: URL, method: String = "GET", headers: [String: String] = [:],
                                        body: [String: String]? = nil, authentication: Bool = false) async throws -> T {
        let data = try await send(url, method: method, headers: headers, body: body, authentication: authentication)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw ClientError.network }
    }

    private func send(_ url: URL, method: String = "GET", headers: [String: String] = [:],
                      body: [String: String]? = nil, authentication: Bool = false) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.allHTTPHeaderFields = headers
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await transport.data(for: request) }
        catch { throw ClientError.network }
        guard let response = response as? HTTPURLResponse else { throw ClientError.network }
        if authentication && [400, 403, 422].contains(response.statusCode) { throw ClientError.expired }
        switch response.statusCode {
        case 200..<300: return data
        case 401: throw ClientError.expired
        case 403, 404: throw ClientError.denied
        default: throw ClientError.network
        }
    }
}
