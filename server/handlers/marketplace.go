package handlers

import (
	"net/http"
	"sort"

	"github.com/genz/server/database"
	"github.com/genz/server/models"
	"github.com/gin-gonic/gin"
)

type CreateListingRequest struct {
	AgentID    string `json:"agent_id" binding:"required"`
	Title      string `json:"title" binding:"required"`
	Summary    string `json:"summary"`
	Category   string `json:"category"`
	PriceCents int    `json:"price_cents"`
	Status     string `json:"status"`
}

type UpdateListingRequest struct {
	Title      *string `json:"title"`
	Summary    *string `json:"summary"`
	Category   *string `json:"category"`
	PriceCents *int    `json:"price_cents"`
	Status     *string `json:"status"`
}

// ListMarketplaceListings returns public active listings.
func ListMarketplaceListings(c *gin.Context) {
	// optional auth
	var userID string
	id, err := getUserID(c)
	if err == nil {
		userID = id
	}

	var listings []models.MarketplaceListing

	status := c.Query("status")
	if status == "" {
		status = "active"
	}

	req := database.GetAdminClient().DB.From("marketplace_listings").Select("*").Eq("status", status)

	category := c.Query("category")
	if category != "" {
		req = req.Eq("category", category)
	}

	err = req.Execute(&listings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}

	sortQuery := c.Query("sort")
	if sortQuery == "popular" {
		sort.SliceStable(listings, func(i, j int) bool {
			return listings[i].DownloadCount > listings[j].DownloadCount
		})
	} else {
		sort.SliceStable(listings, func(i, j int) bool {
			return listings[i].CreatedAt.After(listings[j].CreatedAt)
		})
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}

	listings = enrichListings(listings, userID)
	c.JSON(http.StatusOK, gin.H{"listings": listings, "total": len(listings)})
}

// GetMarketplaceListing returns one active listing.
func GetMarketplaceListing(c *gin.Context) {
	var userID string
	id, err := getUserID(c)
	if err == nil {
		userID = id
	}

	listingID := c.Param("id")
	var listings []models.MarketplaceListing
	err = database.GetAdminClient().DB.From("marketplace_listings").Select("*").Eq("id", listingID).Execute(&listings)
	if err != nil || len(listings) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "listing_not_found"})
		return
	}

	enriched := enrichListings(listings, userID)
	c.JSON(http.StatusOK, gin.H{"listing": enriched[0]})
}

// CreateMarketplaceListing creates a listing.
func CreateMarketplaceListing(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req CreateListingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "message": err.Error()})
		return
	}

	// Verify agent ownership
	var agents []models.Agent
	err = database.GetAdminClient().DB.From("agents").Select("id").Eq("id", req.AgentID).Eq("user_id", userID).Execute(&agents)
	if err != nil || len(agents) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_agent"})
		return
	}

	st := req.Status
	if st == "" {
		st = "draft"
	}

	row := map[string]interface{}{
		"agent_id":    req.AgentID,
		"user_id":     userID,
		"title":       req.Title,
		"summary":     req.Summary,
		"category":    req.Category,
		"price_cents": req.PriceCents,
		"status":      st,
	}

	var created []models.MarketplaceListing
	err = database.GetAdminClient().DB.From("marketplace_listings").Insert(row).Execute(&created)
	if err != nil || len(created) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": "Failed to create listing"})
		return
	}

	enriched := enrichListings(created, userID)
	c.JSON(http.StatusCreated, gin.H{"listing": enriched[0]})
}

func UpdateMarketplaceListing(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	listingID := c.Param("id")
	var req UpdateListingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	updates := make(map[string]interface{})
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Summary != nil {
		updates["summary"] = *req.Summary
	}
	if req.Category != nil {
		updates["category"] = *req.Category
	}
	if req.PriceCents != nil {
		updates["price_cents"] = *req.PriceCents
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}

	if len(updates) > 0 {
		err = database.GetAdminClient().DB.From("marketplace_listings").Update(updates).Eq("id", listingID).Eq("user_id", userID).Execute(&[]models.MarketplaceListing{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error"})
			return
		}
	}

	var updated []models.MarketplaceListing
	_ = database.GetAdminClient().DB.From("marketplace_listings").Select("*").Eq("id", listingID).Execute(&updated)
	if len(updated) > 0 {
		enriched := enrichListings(updated, userID)
		c.JSON(http.StatusOK, gin.H{"listing": enriched[0]})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func DeleteMarketplaceListing(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	listingID := c.Param("id")
	// Soft delete = set to archived
	updates := map[string]interface{}{"status": "archived"}
	err = database.GetAdminClient().DB.From("marketplace_listings").Update(updates).Eq("id", listingID).Eq("user_id", userID).Execute(&[]models.MarketplaceListing{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Listing archived"})
}

func GetMyListings(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var listings []models.MarketplaceListing
	err = database.GetAdminClient().DB.From("marketplace_listings").Select("*").Eq("user_id", userID).Execute(&listings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error"})
		return
	}

	sort.SliceStable(listings, func(i, j int) bool {
		return listings[i].CreatedAt.After(listings[j].CreatedAt)
	})

	listings = enrichListings(listings, userID)
	c.JSON(http.StatusOK, gin.H{"listings": listings})
}

func DownloadListing(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	listingID := c.Param("id")

	// 1. Get listing
	var listings []models.MarketplaceListing
	err = database.GetAdminClient().DB.From("marketplace_listings").Select("*").Eq("id", listingID).Eq("status", "active").Execute(&listings)
	if err != nil || len(listings) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "listing_not_found"})
		return
	}
	listing := listings[0]

	// 2. Check if already downloaded
	var downloads []models.MarketplaceDownload
	_ = database.GetAdminClient().DB.From("marketplace_downloads").Select("*").Eq("listing_id", listingID).Eq("user_id", userID).Execute(&downloads)
	if len(downloads) > 0 {
		c.JSON(http.StatusOK, gin.H{"already_downloaded": true})
		return
	}

	// 3. Duplicate agent
	var sourceAgents []models.Agent
	err = database.GetAdminClient().DB.From("agents").Select("*").Eq("id", listing.AgentID).Execute(&sourceAgents)
	if err != nil || len(sourceAgents) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "agent_not_found"})
		return
	}
	src := sourceAgents[0]

	agentRow := map[string]interface{}{
		"user_id":     userID, // NEW OWNER
		"name":        src.Name,
		"description": src.Description,
		"instruction": src.Instruction,
		"icon_name":   src.IconName,
	}

	var createdAgent []models.Agent
	err = database.GetAdminClient().DB.From("agents").Insert(agentRow).Execute(&createdAgent)
	if err != nil || len(createdAgent) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": "could not copy agent"})
		return
	}
	newAgent := createdAgent[0]

	// 4. Copy skills
	var srcSkills []models.AgentSkill
	_ = database.GetAdminClient().DB.From("agent_skills").Select("skill_id").Eq("agent_id", src.ID).Execute(&srcSkills)

	newSkillIDs := []string{}
	for _, ss := range srcSkills {
		if ss.SkillID != "" {
			_ = database.GetAdminClient().DB.From("agent_skills").Insert(map[string]interface{}{"agent_id": newAgent.ID, "skill_id": ss.SkillID}).Execute(&[]models.AgentSkill{})
			newSkillIDs = append(newSkillIDs, ss.SkillID)
		}
	}
	newAgent.SkillIDs = newSkillIDs

	// 5. Insert download record
	dlRow := map[string]interface{}{
		"listing_id": listing.ID,
		"user_id":    userID,
	}
	_ = database.GetAdminClient().DB.From("marketplace_downloads").Insert(dlRow).Execute(&[]models.MarketplaceDownload{})

	// 6. Increment download count (using an rpc or manual query)
	newCount := listing.DownloadCount + 1
	_ = database.GetAdminClient().DB.From("marketplace_listings").Update(map[string]interface{}{"download_count": newCount}).Eq("id", listing.ID).Execute(&[]models.MarketplaceListing{})

	c.JSON(http.StatusOK, gin.H{
		"already_downloaded": false,
		"agent":              newAgent,
	})
}

// enrichListings joins agent profiles and user info
func enrichListings(listings []models.MarketplaceListing, currentUserID string) []models.MarketplaceListing {
	if len(listings) == 0 {
		return listings
	}

	// Collect IDs
	var agentIDs []string
	var userIDs []string
	var listingIDs []string
	for _, l := range listings {
		agentIDs = append(agentIDs, l.AgentID)
		userIDs = append(userIDs, l.UserID)
		listingIDs = append(listingIDs, l.ID)
	}

	// Fetch agents
	var agents []models.Agent
	_ = database.GetAdminClient().DB.From("agents").Select("*").In("id", agentIDs).Execute(&agents)
	agentMap := make(map[string]models.Agent)
	for _, a := range agents {
		agentMap[a.ID] = a
	}

	// Fetch skills for these agents
	var skills []models.AgentSkill
	_ = database.GetAdminClient().DB.From("agent_skills").Select("agent_id,skill_id").In("agent_id", agentIDs).Execute(&skills)
	skillMap := make(map[string][]string)
	for _, s := range skills {
		skillMap[s.AgentID] = append(skillMap[s.AgentID], s.SkillID)
	}

	// Fetch publishers (profiles -> models.User)
	var profiles []models.User
	_ = database.GetAdminClient().DB.From("profiles").Select("id,name,avatar_url").In("id", userIDs).Execute(&profiles)
	profileMap := make(map[string]models.User)
	for _, p := range profiles {
		profileMap[p.ID] = p
	}

	// Fetch downloads for current user
	downloadMap := make(map[string]bool)
	if currentUserID != "" {
		var myDownloads []models.MarketplaceDownload
		_ = database.GetAdminClient().DB.From("marketplace_downloads").Select("listing_id").Eq("user_id", currentUserID).In("listing_id", listingIDs).Execute(&myDownloads)
		for _, d := range myDownloads {
			downloadMap[d.ListingID] = true
		}
	}

	for i, l := range listings {
		if a, ok := agentMap[l.AgentID]; ok {
			listings[i].AgentName = a.Name
			listings[i].AgentDesc = a.Description
			listings[i].AgentIconName = a.IconName
			listings[i].AgentSkillIDs = skillMap[a.ID]
		}
		if p, ok := profileMap[l.UserID]; ok {
			listings[i].PublisherName = p.Name
			listings[i].PublisherAvatar = p.AvatarURL
		}
		listings[i].Downloaded = downloadMap[l.ID]
	}

	return listings
}
