import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var signedIn = false
    @Published private(set) var busy = false
    @Published private(set) var households: [Household] = []
    @Published private(set) var selected: Household?
    @Published private(set) var events: [CalendarEvent] = []
    @Published private(set) var message: String?
    private var api: APIClient?
    private var config: AuthConfiguration?
    private var session: Session?
    private var generation = UUID()

    init(api: APIClient? = nil) {
        if let api {
            self.api = api
            return
        }
        do {
            let value = Bundle.main.object(forInfoDictionaryKey: "FamilyButlerAPIURL") as? String ?? ""
            api = APIClient(baseURL: try APIClient.httpsURL(value))
        } catch {
            message = ClientError.configuration.message
        }
    }

    func signIn(email: String, password: String) async {
        guard !busy, let api else { return }
        busy = true
        message = nil
        let current = generation
        defer { if current == generation { busy = false } }
        do {
            let config = try await api.authConfiguration()
            let session = try await api.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password, config: config)
            let households = try await api.households(session)
            guard current == generation else { return }
            self.config = config
            self.session = session
            self.households = households
            signedIn = true
        } catch {
            guard current == generation else { return }
            clear()
            message = (error as? ClientError ?? .network).message
        }
    }

    func load(_ household: Household? = nil) async {
        guard !busy, let api, let config, var session else { return }
        busy = true
        message = nil
        events = []
        households = []
        selected = nil
        let current = generation
        defer { if current == generation { busy = false } }
        do {
            if session.expiresAt.timeIntervalSinceNow < 60 {
                session = try await api.refresh(session, config: config)
                guard current == generation else { return }
                self.session = session
            }
            let households = try await api.households(session)
            guard current == generation else { return }
            self.households = households
            if let household {
                guard households.contains(where: { $0.id == household.id }) else { throw ClientError.denied }
                let events = try await api.events(household, session: session)
                guard current == generation else { return }
                self.events = CalendarEvent.upcoming(events)
                selected = household
            }
        } catch {
            guard current == generation else { return }
            let failure = error as? ClientError ?? .network
            if case .expired = failure { clear() }
            message = failure.message
        }
    }

    func signOut() {
        let previous = session
        let configuration = config
        clear()
        message = nil
        if let api, let previous, let configuration {
            Task {
                do { try await api.signOut(previous, config: configuration) }
                catch {
                    // Local credentials and household data are already gone, even if offline.
                }
            }
        }
    }

    func clear() {
        generation = UUID()
        session = nil
        config = nil
        signedIn = false
        busy = false
        households = []
        selected = nil
        events = []
    }
}
