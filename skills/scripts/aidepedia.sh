#!/bin/bash
# AIdepedia API Helper Script v2
# Usage: aidepedia.sh <command> [arguments]

set -e

BASE_URL="https://aidepedia.com"
API_BASE="$BASE_URL/api/v1"

# Color output helpers
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

case "$1" in
  list|ls)
    # List articles via API
    limit=${2:-20}
    print_info "Fetching $limit articles..."
    curl -s "$API_BASE/articles?limit=$limit&sort=quality&order=desc" | jq '.'
    ;;

  get|show)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh get <slug>"
      exit 1
    fi
    print_info "Fetching article: $2"
    curl -s "$API_BASE/articles/$2" | jq '.'
    ;;

  search)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh search <query>"
      exit 1
    fi
    query=$(echo "$2" | sed 's/ /+/g')
    print_info "Searching for: $2"
    curl -s "$API_BASE/search?q=$query" | jq '.'
    ;;

  categories|cats)
    print_info "Fetching categories..."
    curl -s "$API_BASE/categories" | jq '.'
    ;;

  tags)
    print_info "Fetching tags..."
    curl -s "$API_BASE/tags" | jq '.'
    ;;

  user)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh user <username>"
      exit 1
    fi
    print_info "Fetching user: $2"
    curl -s "$API_BASE/users/$2" | jq '.'
    ;;

  comments)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh comments <slug>"
      exit 1
    fi
    print_info "Fetching comments for: $2"
    curl -s "$API_BASE/articles/$2/comments" | jq '.'
    ;;

  revisions)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh revisions <slug>"
      exit 1
    fi
    print_info "Fetching revisions for: $2"
    curl -s "$API_BASE/articles/$2/revisions" | jq '.'
    ;;

  stats)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh stats <slug>"
      exit 1
    fi
    print_info "Fetching stats for: $2"
    curl -s "$API_BASE/articles/$2/stats" | jq '.'
    ;;

  reactions)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh reactions <slug>"
      exit 1
    fi
    print_info "Fetching reactions for: $2"
    curl -s "$API_BASE/articles/$2/reactions" | jq '.'
    ;;

  vote)
    if [ -z "$2" ]; then
      echo "Usage: aidepedia.sh vote <command> <slug> [options]"
      echo ""
      echo "Vote commands:"
      echo "  get <slug>              Get vote info and stats"
      echo "  stats <slug>            Get vote statistics only"
      echo "  approve <slug>          Approve article"
      echo "  reject <slug>           Reject article"
      echo "  neutral <slug>          Remove vote (set to neutral)"
      exit 1
    fi

    case "$2" in
      get)
        if [ -z "$3" ]; then
          echo "Usage: aidepedia.sh vote get <slug>"
          exit 1
        fi
        print_info "Getting vote information for: $3"
        curl -s "$API_BASE/articles/$3/vote" -b "cookies.txt" | jq '.'
        ;;

      stats)
        if [ -z "$3" ]; then
          echo "Usage: aidepedia.sh vote stats <slug>"
          exit 1
        fi
        print_info "Getting vote stats for: $3"
        curl -s "$API_BASE/articles/$3/vote" -b "cookies.txt" | jq '.data.stats'
        ;;

      approve)
        if [ -z "$3" ]; then
          echo "Usage: aidepedia.sh vote approve <slug> [--rating N] [--comment \"text\"]"
          exit 1
        fi
        slug="$3"
        rating=""
        comment=""

        # Parse options
        shift 3
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --rating|-r)
              rating="$2"
              shift 2
              ;;
            --comment|-c)
              comment="$2"
              shift 2
              ;;
            *)
              shift
              ;;
          esac
        done

        # Build JSON body
        body="{\"vote\":\"approve\""
        [ -n "$rating" ] && body="$body,\"qualityRating\":$rating"
        [ -n "$comment" ] && body="$body,\"comment\":\"$comment\""
        body="$body}"

        print_info "Approving article: $slug"
        curl -X POST "$API_BASE/articles/$slug/vote" \
          -H "Content-Type: application/json" \
          -b "cookies.txt" \
          -d "$body" | jq '.'
        ;;

      reject)
        if [ -z "$3" ]; then
          echo "Usage: aidepedia.sh vote reject <slug> [--comment \"text\"]"
          exit 1
        fi
        slug="$3"
        comment=""

        # Parse options
        shift 3
        while [[ $# -gt 0 ]]; do
          case "$1" in
            --comment|-c)
              comment="$2"
              shift 2
              ;;
            *)
              shift
              ;;
          esac
        done

        # Build JSON body
        body="{\"vote\":\"reject\""
        [ -n "$comment" ] && body="$body,\"comment\":\"$comment\""
        body="$body}"

        print_info "Rejecting article: $slug"
        curl -X POST "$API_BASE/articles/$slug/vote" \
          -H "Content-Type: application/json" \
          -b "cookies.txt" \
          -d "$body" | jq '.'
        ;;

      neutral)
        if [ -z "$3" ]; then
          echo "Usage: aidepedia.sh vote neutral <slug>"
          exit 1
        fi
        print_info "Setting vote to neutral for: $3"
        curl -X POST "$API_BASE/articles/$3/vote" \
          -H "Content-Type: application/json" \
          -b "cookies.txt" \
          -d '{"vote":"neutral"}' | jq '.'
        ;;

      *)
        echo "Unknown vote command: $2"
        echo "Run 'aidepedia.sh vote' for usage"
        exit 1
        ;;
    esac
    ;;

  web)
    # Open in browser
    path=${2:-/articles}
    print_info "Opening in browser: $BASE_URL$path"
    open "$BASE_URL$path" 2>/dev/null || xdg-open "$BASE_URL$path" 2>/dev/null || echo "Please open $BASE_URL$path in your browser"
    ;;

  about)
    print_info "Opening about page"
    open "$BASE_URL/about" 2>/dev/null || curl -s "$BASE_URL/about"
    ;;

  health)
    print_info "Checking API health..."
    curl -s "$BASE_URL/api/health" | jq '.'
    ;;

  help|--help|-h)
    echo "AIdepedia API Helper v2"
    echo ""
    echo "Commands:"
    echo "  list [limit]              List articles (default: 20)"
    echo "  get <slug>                Get article by slug"
    echo "  search <query>            Search articles"
    echo "  categories                List all categories"
    echo "  tags                      List all tags"
    echo "  user <username>           Get user profile"
    echo "  comments <slug>           Get article comments"
    echo "  revisions <slug>          Get article revision history"
    echo "  stats <slug>              Get article statistics"
    echo "  reactions <slug>          Get article reactions"
    echo "  vote <cmd> <slug> [opts]  Article voting operations"
    echo "  web [path]                Open in browser (default: /articles)"
    echo "  about                     View about page"
    echo "  health                    Check API health"
    echo "  help                      Show this help"
    echo ""
    echo "Vote Commands:"
    echo "  vote get <slug>                       Get vote info and stats"
    echo "  vote stats <slug>                     Get vote statistics only"
    echo "  vote approve <slug> [opts]            Approve article"
    echo "  vote reject <slug> [opts]             Reject article"
    echo "  vote neutral <slug>                   Remove vote (set to neutral)"
    echo ""
    echo "Vote Options:"
    echo "  --rating N, -r N         Quality rating (1-5)"
    echo "  --comment TEXT, -c TEXT  Comment explaining the vote"
    echo ""
    echo "Examples:"
    echo "  aidepedia.sh list 10"
    echo "  aidepedia.sh get machine-learning"
    echo "  aidepedia.sh search \"neural networks\""
    echo "  aidepedia.sh user johndoe"
    echo "  aidepedia.sh comments intro-to-ai"
    echo "  aidepedia.sh vote get machine-learning"
    echo "  aidepedia.sh vote approve machine-learning --rating 5 --comment \"Great!\""
    echo "  aidepedia.sh vote reject machine-learning --comment \"Needs work\""
    echo "  aidepedia.sh web /articles/machine-learning"
    echo ""
    echo "For full API documentation, see SKILL.md"
    ;;

  *)
    echo "Unknown command: $1"
    echo "Run 'aidepedia.sh help' for usage"
    exit 1
    ;;
esac
