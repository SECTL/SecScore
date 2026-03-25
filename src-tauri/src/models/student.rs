use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Student {
    pub id: i32,
    pub name: String,
    pub group_name: Option<String>,
    pub score: i32,
    pub reward_points: i32,
    pub tags: String,
    pub extra_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentUpdate {
    pub name: Option<String>,
    pub group_name: Option<String>,
    pub score: Option<i32>,
    pub reward_points: Option<i32>,
    pub tags: Option<Vec<String>>,
    pub extra_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudentWithTags {
    pub id: i32,
    pub name: String,
    pub group_name: Option<String>,
    pub score: i32,
    pub reward_points: i32,
    pub tags: Vec<String>,
    pub extra_json: Option<String>,
}

impl From<Student> for StudentWithTags {
    fn from(student: Student) -> Self {
        let tags = serde_json::from_str(&student.tags).unwrap_or_default();
        Self {
            id: student.id,
            name: student.name,
            group_name: student.group_name,
            score: student.score,
            reward_points: student.reward_points,
            tags,
            extra_json: student.extra_json,
        }
    }
}
