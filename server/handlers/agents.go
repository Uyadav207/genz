package handlers

import (
	"net/http"

	"github.com/genz/server/database"
	"github.com/genz/server/models"
	"github.com/gin-gonic/gin"
)

// CreateAgentRequest is the body for POST /api/v1/agents.
type CreateAgentRequest struct {
	Name        string   `json:"name" binding:"required"`
	Description string   `json:"description"`
	Instruction string   `json:"instruction"`
	IconName    string   `json:"icon_name"`
	SkillIDs    []string `json:"skill_ids"`
}

// UpdateAgentRequest is the body for PUT /api/v1/agents/:id.
type UpdateAgentRequest struct {
	Name        *string  `json:"name"`
	Description *string  `json:"description"`
	Instruction *string  `json:"instruction"`
	IconName    *string  `json:"icon_name"`
	SkillIDs    []string `json:"skill_ids"`
}

// ListAgents returns the current user's custom agents.
// GET /api/v1/agents
func ListAgents(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	var agents []models.Agent
	err = database.GetAdminClient().DB.From("agents").
		Select("id,name,description,instruction,icon_name,created_at,updated_at").
		Eq("user_id", userID).
		Execute(&agents)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}
	// Load skills for each agent
	for i := range agents {
		var skills []models.AgentSkill
		_ = database.GetAdminClient().DB.From("agent_skills").
			Select("skill_id").
			Eq("agent_id", agents[i].ID).
			Execute(&skills)
		agents[i].SkillIDs = make([]string, 0, len(skills))
		for _, s := range skills {
			agents[i].SkillIDs = append(agents[i].SkillIDs, s.SkillID)
		}
	}
	c.JSON(http.StatusOK, gin.H{"agents": agents})
}

// GetAgent returns one custom agent by ID.
// GET /api/v1/agents/:id
func GetAgent(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "agent_id_required"})
		return
	}
	var agents []models.Agent
	err = database.GetAdminClient().DB.From("agents").
		Select("id,user_id,name,description,instruction,icon_name,created_at,updated_at").
		Eq("id", id).
		Eq("user_id", userID).
		Execute(&agents)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}
	if len(agents) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent_not_found"})
		return
	}
	a := agents[0]
	var skills []models.AgentSkill
	_ = database.GetAdminClient().DB.From("agent_skills").
		Select("skill_id").
		Eq("agent_id", a.ID).
		Execute(&skills)
	a.SkillIDs = make([]string, 0, len(skills))
	for _, s := range skills {
		a.SkillIDs = append(a.SkillIDs, s.SkillID)
	}
	c.JSON(http.StatusOK, gin.H{"agent": a})
}

// CreateAgent creates a new custom agent.
// POST /api/v1/agents
func CreateAgent(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	var req CreateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "message": err.Error()})
		return
	}
	row := map[string]interface{}{
		"user_id":     userID,
		"name":        req.Name,
		"description": req.Description,
		"instruction": req.Instruction,
		"icon_name":   req.IconName,
	}
	if row["icon_name"] == "" {
		row["icon_name"] = "bot"
	}
	var created []models.Agent
	err = database.GetAdminClient().DB.From("agents").Insert(row).Execute(&created)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}
	if len(created) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": "failed to create agent"})
		return
	}
	agentID := created[0].ID
	insertAgentSkills(agentID, req.SkillIDs)
	a := created[0]
	a.SkillIDs = req.SkillIDs
	c.JSON(http.StatusCreated, gin.H{"agent": a})
}

// UpdateAgent updates a custom agent.
// PUT /api/v1/agents/:id
func UpdateAgent(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "agent_id_required"})
		return
	}
	var req UpdateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "message": err.Error()})
		return
	}
	var agents []models.Agent
	err = database.GetAdminClient().DB.From("agents").Select("id").Eq("id", id).Eq("user_id", userID).Execute(&agents)
	if err != nil || len(agents) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent_not_found"})
		return
	}
	updates := make(map[string]interface{})
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Instruction != nil {
		updates["instruction"] = *req.Instruction
	}
	if req.IconName != nil {
		updates["icon_name"] = *req.IconName
	}
	if len(updates) > 0 {
		err = database.GetAdminClient().DB.From("agents").Update(updates).Eq("id", id).Eq("user_id", userID).Execute(&[]models.Agent{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
			return
		}
	}
	if req.SkillIDs != nil {
		_ = database.GetAdminClient().DB.From("agent_skills").Delete().Eq("agent_id", id).Execute(&[]models.AgentSkill{})
		insertAgentSkills(id, req.SkillIDs)
	}
	var updated []models.Agent
	_ = database.GetAdminClient().DB.From("agents").Select("id,name,description,instruction,icon_name,created_at,updated_at").Eq("id", id).Eq("user_id", userID).Execute(&updated)
	if len(updated) > 0 {
		a := updated[0]
		var skills []models.AgentSkill
		_ = database.GetAdminClient().DB.From("agent_skills").Select("skill_id").Eq("agent_id", id).Execute(&skills)
		a.SkillIDs = make([]string, 0, len(skills))
		for _, s := range skills {
			a.SkillIDs = append(a.SkillIDs, s.SkillID)
		}
		c.JSON(http.StatusOK, gin.H{"agent": a})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

// DeleteAgent deletes a custom agent.
// DELETE /api/v1/agents/:id
func DeleteAgent(c *gin.Context) {
	userID, err := getUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized", "message": err.Error()})
		return
	}
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "agent_id_required"})
		return
	}
	err = database.GetAdminClient().DB.From("agents").Delete().Eq("id", id).Eq("user_id", userID).Execute(&[]models.Agent{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database_error", "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Agent deleted"})
}

func insertAgentSkills(agentID string, skillIDs []string) {
	for _, sid := range skillIDs {
		if sid == "" {
			continue
		}
		_ = database.GetAdminClient().DB.From("agent_skills").
			Insert(map[string]interface{}{"agent_id": agentID, "skill_id": sid}).
			Execute(&[]models.AgentSkill{})
	}
}
